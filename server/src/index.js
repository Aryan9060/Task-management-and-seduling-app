import 'dotenv/config';
import app from './app.js';
import connectDb from './config/db.js';

const port = Number(process.env.PORT) || 5000;

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Copy .env.example to .env and configure it.');
  process.exit(1);
}

if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error(
    'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are not set. Copy .env.example to .env and configure them.'
  );
  process.exit(1);
}

try {
  await connectDb(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
} catch (err) {
  console.error('Failed to start server:', err.message);
  process.exit(1);
}
