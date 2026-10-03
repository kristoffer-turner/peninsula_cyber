function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

function requirePageAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login.html');
}

module.exports = { requireAuth, requirePageAuth };
