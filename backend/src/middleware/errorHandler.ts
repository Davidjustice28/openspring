import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { MAX_BILL_FILE_MB } from '@openspring/shared'
import { AppError } from '../lib/errors.js'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.code ?? 'error', message: err.message })
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'file_too_large',
        message: `Bill file must be ${MAX_BILL_FILE_MB} MB or smaller.`,
      })
    }
    return res.status(400).json({ error: 'upload_error', message: err.message })
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'validation_error', message: err.errors[0]?.message ?? 'Invalid input' })
  }
  console.error(err)
  return res.status(500).json({ error: 'internal_error', message: 'Something went wrong' })
}
