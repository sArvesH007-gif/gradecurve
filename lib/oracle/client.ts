import "server-only";
import oracledb from "oracledb";

const oracleGlobal = globalThis as typeof globalThis & {
  gradeCurveOraclePool?: Promise<oracledb.Pool>;
};

function getPool() {
  const user = process.env.ORACLE_USER;
  const password = process.env.ORACLE_PASSWORD;
  const connectString = process.env.ORACLE_CONNECT_STRING;
  if (!user || !password || !connectString)
    throw new Error("Oracle connection environment is incomplete.");

  return (oracleGlobal.gradeCurveOraclePool ??= oracledb.createPool({
    user,
    password,
    connectString,
    poolMin: 0,
    poolMax: 4,
    poolIncrement: 1,
    poolPingInterval: 30,
  }));
}

export async function withOracleConnection<T>(
  operation: (connection: oracledb.Connection) => Promise<T>,
) {
  const pool = await getPool();
  const connection = await pool.getConnection();
  try {
    return await operation(connection);
  } finally {
    await connection.close();
  }
}

export function oracleUnavailable() {
  return Response.json(
    { error: "Oracle is unavailable. Check the local Oracle service and settings." },
    { status: 503 },
  );
}

export function oracleErrorResponse(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (code.startsWith("NJS-") || /^ORA-12[0-9]{3}$/.test(code) || code === "ORA-01017")
    return Response.json(
      { error: "Oracle is unavailable. Check the local Oracle service and settings." },
      { status: 503 },
    );
  const errorNum =
    typeof error === "object" && error !== null && "errorNum" in error
      ? Number(error.errorNum)
      : 0;
  if (errorNum === 1)
    return Response.json(
      { error: "That Oracle record already exists." },
      { status: 409 },
    );
  if (errorNum >= 20000 && errorNum <= 20999)
    return Response.json(
      { error: "Oracle rejected the operation because its validation rules were not met." },
      {
        status: [20003, 20006, 20009, 20014].includes(errorNum)
          ? 403
          : errorNum === 20015
            ? 409
            : 400,
      },
    );
  return Response.json(
    { error: "Oracle database operation failed." },
    { status: 500 },
  );
}

export function logOracleFailure(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown";
  console.error(`[oracle] request failed (${code})`);
}
