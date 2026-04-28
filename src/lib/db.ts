import mongoose, { connect, Connection } from "mongoose";

const mongo_url = process.env.MONGODB_URL;

if (!mongo_url) {
  throw new Error("Missing MONGODB_URL environment variable");
}

/**
 * We access the global object directly to ensure we are always
 * working with the same connection instance across hot-reloads.
 */
if (!global.mongoose) {
  global.mongoose = {
    conn: null,
    promise: null,
  };
}

const connectDb = async (): Promise<Connection> => {
  // Always use the current state of the global object
  const cached = global.mongoose;

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    /**
     * In Next.js, it's safer to return the connection object
     * after the mongoose instance has successfully connected.
     */
    cached.promise = connect(mongo_url, opts).then((m) => {
      return m.connection;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Reset the promise if connection fails so we can try again on the next request
    cached.promise = null;
    console.error("CRITICAL: MongoDB Connection Failed", error);
    throw error;
  }

  return cached.conn;
};

export default connectDb;
