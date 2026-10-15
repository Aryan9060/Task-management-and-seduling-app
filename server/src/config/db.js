import mongoose from 'mongoose';

export default async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  const conect=await mongoose.connect(uri);
  return mongoose.connection;
}
