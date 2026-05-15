import requests

class MimsClient:
    def __init__(self, base_url, client_id=None, client_secret=None, token=None):
        self.base_url = base_url.rstrip('/')
        self.client_id = client_id
        self.client_secret = client_secret
        self.token = token

    def authenticate(self):
        response = requests.post(f'{self.base_url}/oauth/token', json={
            'grant_type': 'client_credentials',
            'client_id': self.client_id,
            'client_secret': self.client_secret,
        }, timeout=30)
        response.raise_for_status()
        data = response.json()
        self.token = data['access_token']
        return data

    def request(self, path, **kwargs):
        if not self.token:
            self.authenticate()
        headers = kwargs.pop('headers', {})
        headers['Authorization'] = f'Bearer {self.token}'
        response = requests.request(kwargs.pop('method', 'GET'), f'{self.base_url}{path}', headers=headers, timeout=30, **kwargs)
        response.raise_for_status()
        return response.json()

    def cases(self, **params):
        return self.request('/api/v1/cases', params=params)
