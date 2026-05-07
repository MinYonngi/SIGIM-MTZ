const isProd = process.env.NODE_ENV === "production";

module.exports = {
  log(...args) {
    if (!isProd) console.log(...args);
  },

  warn(msg, ...meta) {
    if (isProd) {
      console.warn(msg);
    } else {
      console.warn(msg, ...meta);
    }
  },

  // In production: strips SQL, stack traces and user data from the error object.
  // Logs only the error code so DB internals never reach system logs.
  error(msg, err) {
    if (isProd) {
      const safe =
        err == null
          ? ""
          : err instanceof Error
            ? err.code || err.constructor.name
            : typeof err === "object"
              ? err.code || err.errno || "DB_ERROR"
              : String(err);
      console.error(msg, safe);
    } else {
      console.error(msg, err);
    }
  },
};
