package com.pharaxis.mims;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class MimsClient {
  private final String baseUrl;
  private final String token;
  private final HttpClient http = HttpClient.newHttpClient();

  public MimsClient(String baseUrl, String token) {
    this.baseUrl = baseUrl.replaceAll("/$", "");
    this.token = token;
  }

  public String getCases() throws IOException, InterruptedException {
    HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/v1/cases"))
      .header("Authorization", "Bearer " + token)
      .header("Accept", "application/json")
      .GET()
      .build();
    return http.send(request, HttpResponse.BodyHandlers.ofString()).body();
  }
}
