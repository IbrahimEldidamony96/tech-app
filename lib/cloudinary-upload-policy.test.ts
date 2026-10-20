import assert from "node:assert/strict";
import test from "node:test";
import {
  parseUploadArea, signedImageUploadParams, uploadFolder,
  validateRemoteImageUrl, IMAGE_MAX_BYTES,
} from "./cloudinary-upload-policy";

test("only the explicit three folder names are accepted", () => {
  assert.equal(parseUploadArea("avatars"), "avatars");
  assert.equal(parseUploadArea("products"), "products");
  assert.equal(parseUploadArea("sliders"), "sliders");
  for (const raw of ["users", "../products", "avatars/another-user", null, ""]) {
    assert.equal(parseUploadArea(raw), null);
  }
});

test("avatar uploads are scoped to the current user", () => {
  assert.equal(uploadFolder("avatars", "user123"), "avatars/user123");
  assert.equal(uploadFolder("products", "user123"), "products");
  assert.throws(() => uploadFolder("avatars", "../admin"));
});

test("every signed image upload binds non-overwrite, image formats and random asset", () => {
  const generated = signedImageUploadParams("avatars", "user123", "u_" + "a".repeat(32), 1760000000);
  assert.deepEqual(generated, {
    allowed_formats: "jpg,jpeg,png,webp,avif",
    folder: "avatars/user123",
    overwrite: "false",
    public_id: "u_" + "a".repeat(32),
    timestamp: 1760000000,
  });
  assert.throws(() => signedImageUploadParams("products", "user123", "../bad", 1760000000));
});

test("remote images must use public HTTPS URLs", () => {
  assert.equal(validateRemoteImageUrl("https://images.example.org/p.jpg"), "https://images.example.org/p.jpg");
  for (const bad of [
    "http://images.example.org/x.png", "https://localhost/x", "https://127.0.0.1/x",
    "https://10.0.0.1/x", "https://user:pass@images.example.org/x",
    "https://example.internal/x", "https://[::1]/x", "file:///etc/passwd",
    "https://host.example.com:8443/img.jpg", "https://a.test/image",
  ]) assert.equal(validateRemoteImageUrl(bad), null, bad);
  assert.equal(IMAGE_MAX_BYTES.avatars, 5 * 1024 * 1024);
});
