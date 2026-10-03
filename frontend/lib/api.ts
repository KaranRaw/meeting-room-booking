const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is missing. Set it and restart the frontend.");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 60000);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        body?.message ?? `The API returned HTTP ${response.status} without a readable message.`,
        response.status,
      );
    }
    if (body === null) throw new Error("The API returned an empty or invalid JSON response.");
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new Error("The API did not respond within 60 seconds. Please try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Cannot reach the API. Check the backend URL, connection, and CORS settings.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}