export async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed: ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export async function apiUpload(path, { token, formData }) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed: ${response.status}`)
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}
