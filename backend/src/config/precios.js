export const SERVICE_PRICES = {
  Corte: 250,
  'Corte y barba': 320,
  Barba: 150,
}

export const priceForService = (service) => SERVICE_PRICES[service] ?? 0
