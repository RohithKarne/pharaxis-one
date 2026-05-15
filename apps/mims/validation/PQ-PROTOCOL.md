# Performance Qualification Protocol

1. Generate 1,000 API calls across five clients; verify rate limits and call logging remain stable.
2. Generate 500 ICSR XML previews; p95 response should remain under 1.5 seconds in UAT hardware.
3. Simulate 1,000 workflow traces; no trace may exceed 100 nodes or loop indefinitely.
4. Run AI quality checks on 1,000 cases using local fallback; no case save path should depend on external LLM availability.
