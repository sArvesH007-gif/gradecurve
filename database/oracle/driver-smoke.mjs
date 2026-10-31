import { config } from "dotenv";
import oracledb from "oracledb";

config({ path: ".env.local" });

const { ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING } = process.env;
if (!ORACLE_USER || !ORACLE_PASSWORD || !ORACLE_CONNECT_STRING) {
  throw new Error("Set Oracle connection variables in .env.local first.");
}

const pool = await oracledb.createPool({
  user: ORACLE_USER,
  password: ORACLE_PASSWORD,
  connectString: ORACLE_CONNECT_STRING,
  poolMin: 0,
  poolMax: 1,
});

try {
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute(
      "SELECT SYS_CONTEXT('USERENV', 'CON_NAME') AS CON_NAME FROM dual",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    console.log(
      JSON.stringify({
        thin: connection.thin,
        database: connection.oracleServerVersionString,
        container: result.rows?.[0]?.CON_NAME,
      }),
    );
  } finally {
    await connection.close();
  }
} finally {
  await pool.close(0);
}
