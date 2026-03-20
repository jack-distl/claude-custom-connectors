import { apiRequest } from "@custom-connectors/shared";

const BASE_URL = "https://api.example.com/v1";

/**
 * Example API call — replace with real third-party API calls.
 */
export async function getExampleResource(
  accessToken: string,
  resourceId: string
) {
  return apiRequest(`${BASE_URL}/resources/${resourceId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
