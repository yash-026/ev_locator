const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get admin dashboard stats
router.get('/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    
    // Get total stations
    const stationsResult = await pool.query(
      'SELECT COUNT(*) as total FROM stations WHERE status = $1',
      ['active']
    );
    
    // Get total bookings today
    const bookingsTodayResult = await pool.query(`
      SELECT COUNT(*) as total FROM bookings 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    
    // Get active bookings
    const activeBookingsResult = await pool.query(`
      SELECT COUNT(*) as total FROM bookings 
      WHERE status = 'active' AND NOW() BETWEEN start_time AND end_time
    `);
    
    // Get revenue today
    const revenueTodayResult = await pool.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total FROM bookings 
      WHERE DATE(created_at) = CURRENT_DATE AND status IN ('completed', 'active')
    `);
    
    // Get hourly booking counts for today
    const hourlyBookingsResult = await pool.query(`
      SELECT 
        EXTRACT(hour FROM start_time) as hour,
        COUNT(*) as bookings
      FROM bookings 
      WHERE DATE(start_time) = CURRENT_DATE
      GROUP BY EXTRACT(hour FROM start_time)
      ORDER BY hour
    `);
    
    // Get station utilization
    const utilizationResult = await pool.query(`
      SELECT 
        s.name,
        s.total_slots,
        COUNT(b.id) as total_bookings,
        ROUND(
          (COUNT(b.id)::float / s.total_slots) * 100, 2
        ) as utilization_percentage
      FROM stations s
      LEFT JOIN bookings b ON s.id = b.station_id 
        AND DATE(b.start_time) = CURRENT_DATE
      WHERE s.status = 'active'
      GROUP BY s.id, s.name, s.total_slots
      ORDER BY utilization_percentage DESC
    `);
    
    res.json({
      stats: {
        totalStations: parseInt(stationsResult.rows[0].total),
        bookingsToday: parseInt(bookingsTodayResult.rows[0].total),
        activeBookings: parseInt(activeBookingsResult.rows[0].total),
        revenueToday: parseFloat(revenueTodayResult.rows[0].total)
      },
      hourlyBookings: hourlyBookingsResult.rows,
      stationUtilization: utilizationResult.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all bookings with filters
router.get('/bookings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { 
      status, 
      station_id, 
      date_from, 
      date_to, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    let query = `
      SELECT 
        b.*,
        s.name as station_name,
        s.address as station_address
      FROM bookings b
      JOIN stations s ON b.station_id = s.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (status) {
      query += ` AND b.status = $${++paramCount}`;
      params.push(status);
    }
    
    if (station_id) {
      query += ` AND b.station_id = ${++paramCount}`;
      params.push(station_id);
    }
    
    if (date_from) {
      query += ` AND b.start_time >= ${++paramCount}`;
      params.push(date_from);
    }
    
    if (date_to) {
      query += ` AND b.start_time <= ${++paramCount}`;
      params.push(date_to);
    }
    
    query += ` ORDER BY b.created_at DESC`;
    
    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT ${++paramCount} OFFSET ${++paramCount}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM bookings b
      JOIN stations s ON b.station_id = s.id
      WHERE 1=1
    `;
    
    const countParams = [];
    let countParamCount = 0;
    
    if (status) {
      countQuery += ` AND b.status = ${++countParamCount}`;
      countParams.push(status);
    }
    
    if (station_id) {
      countQuery += ` AND b.station_id = ${++countParamCount}`;
      countParams.push(station_id);
    }
    
    if (date_from) {
      countQuery += ` AND b.start_time >= ${++countParamCount}`;
      countParams.push(date_from);
    }
    
    if (date_to) {
      countQuery += ` AND b.start_time <= ${++countParamCount}`;
      countParams.push(date_to);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].total);
    
    res.json({
      bookings: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get all stations for admin
router.get('/stations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    
    const result = await pool.query(`
      SELECT 
        s.*,
        COUNT(b.id) as total_bookings,
        COUNT(CASE WHEN b.status = 'active' AND NOW() BETWEEN b.start_time AND b.end_time THEN 1 END) as current_active,
        ROUND(AVG(CASE WHEN b.status = 'completed' THEN b.power_consumption END), 2) as avg_power_usage,
        COALESCE(SUM(CASE WHEN b.status IN ('completed', 'active') THEN b.total_cost END), 0) as total_revenue
      FROM stations s
      LEFT JOIN bookings b ON s.id = b.station_id
      GROUP BY s.id
      ORDER BY s.name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin stations:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// Create new station
router.post('/stations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const {
      name,
      address,
      latitude,
      longitude,
      total_slots,
      connector_types,
      pricing_per_hour,
      amenities,
      max_power_kw
    } = req.body;
    
    // Validate required fields
    if (!name || !address || !latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await pool.query(`
      INSERT INTO stations (
        name, address, latitude, longitude, total_slots, 
        connector_types, pricing_per_hour, amenities, max_power_kw
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      name,
      address,
      parseFloat(latitude),
      parseFloat(longitude),
      total_slots || 4,
      JSON.stringify(connector_types || ['Type 2', 'CCS']),
      pricing_per_hour || 25.00,
      JSON.stringify(amenities || []),
      max_power_kw || 50
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating station:', error);
    res.status(500).json({ error: 'Failed to create station' });
  }
});

// Update station
router.put('/stations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const {
      name,
      address,
      latitude,
      longitude,
      total_slots,
      connector_types,
      pricing_per_hour,
      amenities,
      max_power_kw,
      status
    } = req.body;
    
    const result = await pool.query(`
      UPDATE stations SET
        name = COALESCE($1, name),
        address = COALESCE($2, address),
        latitude = COALESCE($3, latitude),
        longitude = COALESCE($4, longitude),
        total_slots = COALESCE($5, total_slots),
        connector_types = COALESCE($6, connector_types),
        pricing_per_hour = COALESCE($7, pricing_per_hour),
        amenities = COALESCE($8, amenities),
        max_power_kw = COALESCE($9, max_power_kw),
        status = COALESCE($10, status),
        updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `, [
      name,
      address,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      total_slots,
      connector_types ? JSON.stringify(connector_types) : null,
      pricing_per_hour,
      amenities ? JSON.stringify(amenities) : null,
      max_power_kw,
      status,
      id
    ]);
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating station:', error);
    res.status(500).json({ error: 'Failed to update station' });
  }
});

// Delete station
router.delete('/stations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    
    // Check if station has active bookings
    const activeBookingsResult = await pool.query(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE station_id = $1 AND status = 'active'
    `, [id]);
    
    if (parseInt(activeBookingsResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete station with active bookings' 
      });
    }
    
    const result = await pool.query(
      'DELETE FROM stations WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    res.json({ message: 'Station deleted successfully' });
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

// Get power consumption analytics
router.get('/analytics/power', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { station_id, days = 7 } = req.query;
    
    let query = `
      SELECT 
        DATE_TRUNC('day', pl.recorded_at) as date,
        s.name as station_name,
        s.id as station_id,
        ROUND(AVG(pl.power_kw), 2) as avg_power,
        ROUND(MAX(pl.power_kw), 2) as peak_power,
        ROUND(SUM(pl.power_kw), 2) as total_power,
        COUNT(*) as readings
      FROM power_logs pl
      JOIN stations s ON pl.station_id = s.id
      WHERE pl.recorded_at >= NOW() - INTERVAL '${parseInt(days)} days'
    `;
    
    const params = [];
    
    if (station_id) {
      query += ` AND pl.station_id = $1`;
      params.push(station_id);
    }
    
    query += `
      GROUP BY DATE_TRUNC('day', pl.recorded_at), s.name, s.id
      ORDER BY date DESC, s.name
    `;
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching power analytics:', error);
    res.status(500).json({ error: 'Failed to fetch power analytics' });
  }
});

// Get revenue analytics
router.get('/analytics/revenue', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { days = 30 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        DATE_TRUNC('day', b.created_at) as date,
        COUNT(b.id) as total_bookings,
        COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) as cancelled_bookings,
        ROUND(COALESCE(SUM(CASE WHEN b.status IN ('completed', 'active') THEN b.total_cost END), 0), 2) as revenue,
        ROUND(AVG(CASE WHEN b.status IN ('completed', 'active') THEN b.total_cost END), 2) as avg_booking_value
      FROM bookings b
      WHERE b.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE_TRUNC('day', b.created_at)
      ORDER BY date DESC
    `, []);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// Manually update booking status (admin override)
router.put('/bookings/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const io = req.app.locals.io;
    const { id } = req.params;
    const { status, reason } = req.body;
    
    if (!['active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await pool.query(`
      UPDATE bookings 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *, station_id
    `, [status, id]);
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    
    // Emit real-time update
    io.to(`station_${booking.station_id}`).emit('bookingUpdate', {
      type: 'admin_status_change',
      booking,
      stationId: booking.station_id,
      reason
    });
    
    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

module.exports = router;