/** Max bill upload size (PDF/image). Keep in sync with multer limits on POST /api/bills/parse. */
export const MAX_BILL_FILE_BYTES = 20 * 1024 * 1024

export const MAX_BILL_FILE_MB = MAX_BILL_FILE_BYTES / (1024 * 1024)
