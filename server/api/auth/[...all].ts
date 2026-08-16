import { defineEventHandler, toWebRequest } from 'h3'
import { getAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await getAuth(event)
  return auth.handler(toWebRequest(event))
})
