from locust import HttpUser, task, between


class PRDPortalUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        resp = self.client.post(
            "/api/v1/auth/login",
            json={"email": "ba@test.com", "password": "testpass"},
        )
        self.token = resp.json().get("access_token", "")
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def list_projects(self):
        self.client.get("/api/v1/projects/", headers=self.headers)

    @task(1)
    def get_prd(self):
        self.client.get("/api/v1/prd/1", headers=self.headers)

    @task(1)
    def health(self):
        self.client.get("/health")
