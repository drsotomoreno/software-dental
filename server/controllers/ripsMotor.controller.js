/**
 * Controlador del Motor RIPS mock.
 * Recibe el DTO clínico del frontend, llama a MinSaludService y devuelve CUV o glosas.
 * Sin OAuth2: la autenticación se añadirá cuando exista la API oficial.
 */

import { minSaludService } from '../services/MinSaludService.js'

/**
 * POST /api/rips/transmitir
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function transmitirRips(req, res, next) {
  try {
    const result = await minSaludService.transmitirRIPS(req.body ?? {})
    if (!result.success) {
      return res.status(422).json(result)
    }
    return res.json(result)
  } catch (error) {
    next(error)
  }
}
