const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Get user's bookings
router.get('/my-bookings', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.auth.userId;
    
    const result = await pool.query(`
      SELECT 
        b.*,
        s.name as station_name,
        s.address as station_address,
        s.latitude,
        s.longitude,
        s.pricing_per_hour
      FROM bookings b
      JOIN stations s ON b.station_id = s.id
      WHERE b.user_id = $1
      ORDER BY b.start_time DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Create new booking
router.post('/', requireAuth, async (req, res) => {
  const client = await req.app.locals.pool.connect();
  
  try {
    const userId = req.auth.userId;
    const { station_id, start_time, end_time, slot_number } = req.body;
    const io = req.app.locals.io;
    
    // Validate required fields
    if (!station_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Start transaction
    await client.query('BEGIN');
    
    // Check station exists and get pricing
    const stationResult = await client.query(
      'SELECT total_slots, pricing_per_hour FROM stations WHERE id = $1 AND status = $2',
      [station_id, 'active']
    );
    
    if (!stationResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Station not found or inactive' });
    }
    
    const { total_slots, pricing_per_hour } = stationResult.rows[0];
    
    // Check for conflicting bookings
    const conflictResult = await client.query(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE station_id = $1 
      AND status IN ('active', 'pending')
      AND (
        ($2 BETWEEN start_time AND end_time) OR
        ($3 BETWEEN start_time AND end_time) OR
        (start_time BETWEEN $2 AND $3)
      )
    `, [station_id, start_time, end_time]);
    
    if (parseInt(conflictResult.rows[0].count) >= total_slots) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No available slots for selected time' });
    }
    
    // Assign slot number if not provided
    let assignedSlotNumber = slot_number;
    if (!assignedSlotNumber) {
      const usedSlotsResult = await client.query(`
        SELECT DISTINCT slot_number
        FROM bookings
        WHERE station_id = $1
        AND status IN ('active', 'pending')
        AND ($2 BETWEEN start_time AND end_time OR $3 BETWEEN start_time AND end_time)
      `, [station_id, start_time, end_time]);
      
      const usedSlots = usedSlotsResult.rows.map(row => row.slot_number);
      
      for (let i = 1; i <= total_slots; i++) {
        if (!usedSlots.includes(i)) {
          assignedSlotNumber = i;
          break;
        }
      }
    }
    
    // Calculate total cost
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    const durationHours = (endDate - startDate) / (1000 * 60 * 60);
    const totalCost = (durationHours * pricing_per_hour).toFixed(2);
    
    // Create booking
    const bookingResult = await client.query(`
      INSERT INTO bookings (station_id, user_id, slot_number, start_time, end_time, total_cost, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [station_id, userId, assignedSlotNumber, start_time, end_time, totalCost, 'pending']);
    
    await client.query('COMMIT');
    
    const booking = bookingResult.rows[0];
    
    // Emit real-time update
    io.to(`station_${station_id}`).emit('bookingUpdate', {
      type: 'new_booking',
      booking,
      stationId: station_id
    });
    
    res.status(201).json(booking);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  } finally {
    client.release();
  }
});

// Update booking status
router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const io = req.app.locals.io;
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.auth.userId;
    
    if (!['active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Update booking
    const result = await pool.query(`
      UPDATE bookings 
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING *, station_id
    `, [status, id, userId]);
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    
    // If booking is being activated, log initial power consumption
    if (status === 'active') {
      await pool.query(`
        INSERT INTO power_logs (station_id, booking_id, power_kw)
        VALUES ($1, $2, $3)
      `, [booking.station_id, booking.id, 0]);
    }
    
    // Emit real-time update
    io.to(`station_${booking.station_id}`).emit('bookingUpdate', {
      type: 'status_change',
      booking,
      stationId: booking.station_id
    });
    
    res.json(booking);
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Update power consumption for active booking
router.put('/:id/power', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const io = req.app.locals.io;
    const { id } = req.params;
    const { power_kw } = req.body;
    const userId = req.auth.userId;
    
    // Verify booking belongs to user and is active
    const bookingResult = await pool.query(`
      SELECT station_id FROM bookings 
      WHERE id = $1 AND user_id = $2 AND status = 'active'
    `, [id, userId]);
    
    if (!bookingResult.rows.length) {
      return res.status(404).json({ error: 'Active booking not found' });
    }
    
    const stationId = bookingResult.rows[0].station_id;
    
    // Update booking power consumption
    await pool.query(`
      UPDATE bookings 
      SET power_consumption = $1, updated_at = NOW()
      WHERE id = $2
    `, [power_kw, id]);
    
    // Log power consumption
    await pool.query(`
      INSERT INTO power_logs (station_id, booking_id, power_kw)
      VALUES ($1, $2, $3)
    `, [stationId, id, power_kw]);
    
    // Emit real-time power update
    io.to(`station_${stationId}`).emit('powerUpdate', {
      bookingId: id,
      stationId,
      powerKw: power_kw,
      timestamp: new Date()
    });
    
    res.json({ success: true, power_kw });
  } catch (error) {
    console.error('Error updating power consumption:', error);
    res.status(500).json({ error: 'Failed to update power consumption' });
  }
});

// Cancel booking
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const io = req.app.locals.io;
    const { id } = req.params;
    const userId = req.auth.userId;
    
    const result = await pool.query(`
      UPDATE bookings 
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'active')
      RETURNING *, station_id
    `, [id, userId]);
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Booking not found or cannot be cancelled' });
    }
    
    const booking = result.rows[0];
    
    // Emit real-time update
    io.to(`station_${booking.station_id}`).emit('bookingUpdate', {
      type: 'cancellation',
      booking,
      stationId: booking.station_id
    });
    
    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

module.exports = router;