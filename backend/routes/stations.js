const express = require('express');
const router = express.Router();

// Get all stations with real-time availability
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { lat, lng, radius = 50 } = req.query;
    
    let query = `
      SELECT s.*, 
             COUNT(CASE WHEN b.status = 'active' AND NOW() BETWEEN b.start_time AND b.end_time THEN 1 END) as occupied_slots,
             ROUND(AVG(CASE WHEN b.status = 'active' THEN b.power_consumption ELSE NULL END), 2) as avg_power
      FROM stations s
      LEFT JOIN bookings b ON s.id = b.station_id
      WHERE s.status = 'active'
    `;
    
    const params = [];
    
    // Add distance filter if coordinates provided
    if (lat && lng) {
      query += ` AND (
        6371 * acos(
          cos(radians($${params.length + 1})) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($${params.length + 2})) + 
          sin(radians($${params.length + 1})) * sin(radians(latitude))
        )
      ) <= $${params.length + 3}`;
      params.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
    }
    
    query += `
      GROUP BY s.id
      ORDER BY s.name
    `;
    
    const result = await pool.query(query, params);
    
    // Calculate available slots and distance
    const stations = result.rows.map(station => {
      const available_slots = station.total_slots - (station.occupied_slots || 0);
      let distance = null;
      
      if (lat && lng) {
        distance = calculateDistance(
          parseFloat(lat), parseFloat(lng),
          parseFloat(station.latitude), parseFloat(station.longitude)
        );
      }
      
      return {
        ...station,
        available_slots,
        distance: distance ? Math.round(distance * 10) / 10 : null
      };
    });
    
    res.json(stations);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// Get specific station details
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    
    const stationResult = await pool.query(`
      SELECT s.*, 
             COUNT(CASE WHEN b.status = 'active' AND NOW() BETWEEN b.start_time AND b.end_time THEN 1 END) as occupied_slots,
             ROUND(AVG(CASE WHEN b.status = 'active' THEN b.power_consumption ELSE NULL END), 2) as avg_power
      FROM stations s
      LEFT JOIN bookings b ON s.id = b.station_id
      WHERE s.id = $1 AND s.status = 'active'
      GROUP BY s.id
    `, [id]);
    
    if (!stationResult.rows.length) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    const station = stationResult.rows[0];
    station.available_slots = station.total_slots - (station.occupied_slots || 0);
    
    // Get current bookings for time slots
    const bookingsResult = await pool.query(`
      SELECT slot_number, start_time, end_time, status
      FROM bookings
      WHERE station_id = $1 AND status IN ('active', 'pending')
      AND end_time > NOW()
      ORDER BY start_time
    `, [id]);
    
    station.current_bookings = bookingsResult.rows;
    
    res.json(station);
  } catch (error) {
    console.error('Error fetching station:', error);
    res.status(500).json({ error: 'Failed to fetch station details' });
  }
});

// Get available time slots for a station
router.get('/:id/availability', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter required' });
    }
    
    // Get station info
    const stationResult = await pool.query(
      'SELECT total_slots FROM stations WHERE id = $1',
      [id]
    );
    
    if (!stationResult.rows.length) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    const totalSlots = stationResult.rows[0].total_slots;
    
    // Get existing bookings for the date
    const bookingsResult = await pool.query(`
      SELECT slot_number, start_time, end_time
      FROM bookings
      WHERE station_id = $1 
      AND DATE(start_time) = $2
      AND status IN ('active', 'pending')
    `, [id, date]);
    
    // Generate time slots (24 hours, hourly slots)
    const timeSlots = [];
    for (let hour = 0; hour < 24; hour++) {
      const slotTime = `${hour.toString().padStart(2, '0')}:00`;
      const availableSlots = totalSlots - bookingsResult.rows.filter(booking => {
        const bookingStart = new Date(booking.start_time).getHours();
        const bookingEnd = new Date(booking.end_time).getHours();
        return hour >= bookingStart && hour < bookingEnd;
      }).length;
      
      timeSlots.push({
        time: slotTime,
        available_slots: Math.max(0, availableSlots),
        is_available: availableSlots > 0
      });
    }
    
    res.json(timeSlots);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Get power consumption data for a station
router.get('/:id/power', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { hours = 24 } = req.query;
    
    const powerResult = await pool.query(`
      SELECT 
        DATE_TRUNC('hour', recorded_at) as hour,
        ROUND(AVG(power_kw), 2) as avg_power,
        ROUND(MAX(power_kw), 2) as peak_power,
        COUNT(*) as readings
      FROM power_logs
      WHERE station_id = $1 
      AND recorded_at >= NOW() - INTERVAL '${parseInt(hours)} hours'
      GROUP BY DATE_TRUNC('hour', recorded_at)
      ORDER BY hour
    `, [id]);
    
    res.json(powerResult.rows);
  } catch (error) {
    console.error('Error fetching power data:', error);
    res.status(500).json({ error: 'Failed to fetch power consumption data' });
  }
});

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

module.exports = router;