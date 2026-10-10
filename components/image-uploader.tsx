"use client";

import { useRef, useState } from "react";
import Image from "next/image";

type Props = {
  value: string;
  onChange: (url: string) => void;
  folder?: "avatars" | "products" | "sliders";
  previewClassName?: string;
  size?: number;
};

export function ImageUploader({
  value,
  onChange,
  folder = "avatars",
  previewClassName = "rounded-full object-cover",
  size = 64,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      // 1. نجيب توقيع من عندنا (بيثبت هوية اليوزر ويحدد الفولدر المسموح)
      const signRes = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      const signBody = await signRes.json();
      if (!signRes.ok)
        throw new Error(signBody.error ?? "Could not start upload");

      const { timestamp, signature, cloudName, apiKey } = signBody.data;

      // 2. الملف نفسه بيتبعت *مباشرة* لـ Cloudinary من المتصفح — مش
      // عن طريق السيرفر بتاعنا خالص (كده مفيش حد أقصى لحجم الـ body
      // بتاع الـ serverless function عندنا يأثر على حجم الصورة)
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("signature", signature);
      form.append("folder", folder);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: form,
        },
      );
      const uploadBody = await uploadRes.json();
      if (!uploadRes.ok)
        throw new Error(uploadBody.error?.message ?? "Upload failed");

      onChange(uploadBody.secure_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleUrlSubmit() {
    if (!urlInput) return;
    setUploading(true);
    setError("");

    try {
      const res = await fetch("/api/cloudinary/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput, folder }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      onChange(body.data.url);
      setUrlInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-3 text-xs font-medium">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={
            mode === "file" ? "text-ink underline" : "text-steel hover:text-ink"
          }
        >
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={
            mode === "url" ? "text-ink underline" : "text-steel hover:text-ink"
          }
        >
          Paste URL
        </button>
      </div>

      {mode === "file" ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="mt-2 block text-sm text-steel disabled:opacity-50"
        />
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded-md border border-steel/25 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleUrlSubmit}
            disabled={uploading || !urlInput}
            className="rounded-md border border-steel/25 px-3 py-2 text-sm text-ink disabled:opacity-40"
          >
            Use
          </button>
        </div>
      )}

      {uploading && <p className="mt-1 text-xs text-steel">Uploading…</p>}
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}

      {value && (
        <Image
          src={value}
          alt="Preview"
          width={size}
          height={size}
          className={`mt-2 ${previewClassName}`}
        />
      )}
    </div>
  );
}
