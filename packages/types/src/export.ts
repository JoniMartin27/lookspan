/**
 * How many traces a single export returns when the caller does not ask for a
 * different limit.
 *
 * Shared so the dashboard can warn *before* the download that an export will be
 * capped: the server says so in the response headers and the filename, but by
 * then the file is already on disk.
 */
export const DEFAULT_EXPORT_LIMIT = 1000;

/** Hard ceiling for a single export, whatever `limit` the caller asks for. */
export const MAX_EXPORT_LIMIT = 10_000;
