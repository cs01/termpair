export type AesKeysRef = {
  bootstrap: Nullable<CryptoKey>;
  browser: Nullable<CryptoKey>;
  unix: Nullable<CryptoKey>;
  ivCount: Nullable<number>;
  maxIvCount: Nullable<number>;
};
