import "dotenv/config";
import { config } from "dotenv";
import oracledb from "oracledb";
import { hashPassword } from "../lib/auth/password";

config({ path: ".env.local" });

const password = process.env.DEMO_PASSWORD;
const user = process.env.ORACLE_USER;
const databasePassword = process.env.ORACLE_PASSWORD;
const connectString = process.env.ORACLE_CONNECT_STRING;
if (!password || !user || !databasePassword || !connectString)
  throw new Error("Set DEMO_PASSWORD and Oracle connection variables in .env.local.");

const connection = await oracledb.getConnection({ user, password: databasePassword, connectString });
try {
  const result = await connection.execute<{ userId: number }>(
    `SELECT user_id AS "userId" FROM users WHERE password_hash = 'DEMO_ONLY_NO_LOGIN' ORDER BY user_id`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  for (const row of result.rows ?? []) {
    await connection.execute(
      `UPDATE users SET password_hash = :passwordHash, updated_at = SYSTIMESTAMP
       WHERE user_id = :userId AND password_hash = 'DEMO_ONLY_NO_LOGIN'`,
      { passwordHash: hashPassword(password), userId: row.userId },
    );
  }
  await connection.commit();
  console.log(`Provisioned hashed demo login credentials for ${result.rows?.length ?? 0} Oracle accounts.`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.close();
}
