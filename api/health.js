module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify({
    ok: true,
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production'
  }));
};
