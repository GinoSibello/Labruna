import argon2 from "argon2";

const password = process.argv[2];

if (!password || password.length < 12) {
  console.error("Uso: npm run user:hash -- \"una-clave-de-al-menos-12-caracteres\"");
  process.exit(1);
}

const hash = await argon2.hash(password, { type: argon2.argon2id });
console.log(hash);
