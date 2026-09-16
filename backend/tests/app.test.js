import request from 'supertest'
import app from '../src/app.js'

describe('API health check', () => {
  it('returns the API status', async () => {
    const response = await request(app).get('/api/health')
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ status: 'ok', service: 'barberops-api' })
  })
})
