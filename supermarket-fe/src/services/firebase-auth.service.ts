import type { AuthResponse } from "../types";
import client from "./api/client";
import { Endpoints } from "./api/endpoints";

type FirebaseAuthPayload = {
  id_token: string;
};

export const firebaseAuthService = {
  firebaseAuthLogin: async (
    payload: FirebaseAuthPayload,
  ): Promise<AuthResponse> => {
    const response = await client.post<AuthResponse>(
      Endpoints.FIREBASE_AUTH,
      payload,
    );

    return response.data;
  },
};
