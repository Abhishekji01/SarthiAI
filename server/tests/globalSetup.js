/**
 * One throwaway MongoDB for the run; each test file uses its own database.
 *
 * Set MONGODB_TEST_URI (e.g. mongodb://127.0.0.1:27017) to use an existing
 * MongoDB server instead of downloading one with mongodb-memory-server
 * (useful in CI or on networks that block the MongoDB download host).
 */
export default async function setup({ provide }) {
  if (process.env.MONGODB_TEST_URI) {
    provide('mongoUri', process.env.MONGODB_TEST_URI);
    return async () => {};
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  provide('mongoUri', mongod.getUri());
  return async () => { await mongod.stop(); };
}
