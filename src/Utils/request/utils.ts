import { LocalStorageKeys } from "@/common/constants";

import { HttpMethod, QueryParams, Type } from "@/Utils/request/types";

export const API = <TResponse, TBody = undefined>(
  route: `${HttpMethod} ${string}`,
) => {
  const [method, path] = route.split(" ") as [HttpMethod, string];
  return {
    path,
    method,
    TRes: Type<TResponse>(),
    TBody: Type<TBody>(),
  };
};

export function makeUrl(
  path: string,
  query?: QueryParams,
  pathParams?: Record<string, string | number>,
) {
  if (pathParams) {
    path = Object.entries(pathParams).reduce(
      (acc, [key, value]) => acc.replace(`{${key}}`, `${value}`),
      path,
    );
  }

  if (query) {
    const queryString = makeQueryParams(query);
    if (queryString) {
      path += `?${queryString}`;
    }
  }

  return path;
}

const makeQueryParams = (query: QueryParams) => {
  const qParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach((v) => qParams.append(key, `${v}`));
      return;
    }

    qParams.set(key, `${value}`);
  });

  return qParams.toString();
};

export function makeHeaders(
  noAuth: boolean,
  additionalHeaders?: HeadersInit,
  isFormData?: boolean,
  path?: string,
) {
  const headers = new Headers(additionalHeaders);

  // Don't set Content-Type for FormData - let browser set it with boundary
  if (!isFormData) {
    headers.set("Content-Type", "application/json");
  }
  headers.append("Accept", "application/json");

  const authorizationHeader = getAuthorizationHeader(path);
  if (authorizationHeader && !noAuth && !headers.has("Authorization")) {
    headers.set("Authorization", authorizationHeader);
  }

  return headers;
}

export function getAuthorizationHeader(path?: string) {
  const isOtpPath =
    path?.includes("/api/v1/otp/") || path?.includes("/otp/slots/");

  const patientTokenStr = localStorage.getItem(
    LocalStorageKeys.patientTokenKey,
  );
  const accessToken = localStorage.getItem(LocalStorageKeys.accessToken);

  if (isOtpPath && patientTokenStr) {
    try {
      const patientToken = JSON.parse(patientTokenStr);
      if (patientToken && patientToken.token) {
        return `Bearer ${patientToken.token}`;
      }
    } catch {
      // Ignored
    }
  }

  if (accessToken) {
    return `Bearer ${accessToken}`;
  }

  if (patientTokenStr) {
    try {
      const patientToken = JSON.parse(patientTokenStr);
      if (patientToken && patientToken.token) {
        return `Bearer ${patientToken.token}`;
      }
    } catch {
      // Ignored
    }
  }

  return null;
}

export async function getResponseBody<TData>(res: Response): Promise<TData> {
  if (!(res.headers.get("content-length") !== "0")) {
    return null as TData;
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const isBinary =
    contentType.includes("image") || contentType.includes("application/pdf");

  if (isBinary) {
    return (await res.blob()) as TData;
  }

  if (!isJson) {
    return (await res.text()) as TData;
  }

  try {
    return await res.json();
  } catch {
    return (await res.text()) as TData;
  }
}

export function swapElements<T>(arr: T[], idx1: number, idx2: number): T[] {
  if (idx1 < 0 || idx1 >= arr.length || idx2 < 0 || idx2 >= arr.length) {
    return arr;
  }
  const newArray = [...arr];
  [newArray[idx1], newArray[idx2]] = [newArray[idx2], newArray[idx1]];
  return newArray;
}
