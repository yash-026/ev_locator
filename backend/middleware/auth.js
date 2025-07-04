const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

const requireAuth = ClerkExpressRequireAuth({
  secretKey: process.env.CLERK_SECRET_KEY
});

const requireAdmin = async (req, res, next) => {
  try {
    // Check if user has admin role
    const userId = req.auth.userId;
    const pool = req.app.locals.pool;
    
    const userResult = await pool.query(
      'SELECT role FROM users WHERE clerk_id = $1',
      [userId]
    );
    
    if (!userResult.rows.length || userResult.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

module.exports = { requireAuth, requireAdmin };