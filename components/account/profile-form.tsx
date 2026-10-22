"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ImageUploader } from "@/components/image-uploader";

export function ProfileForm({
  initialName,
  initialImage,
}: {
  initialName: string;
  initialImage: string | null;
}) {
  const { update } = useSession();
  const t = useTranslations("Account");
  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    try {
      e.preventDefault();
      setSubmitting(true);
      setError("");
      setSuccess(false);

      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, image: image || undefined }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? t("profileUpdateFailed"));
        setSubmitting(false);
        return;
      }

      // بيحدّث الـ JWT/session فورًا (jwt callback بيقرا trigger: "update")
      // من غير ما اليوزر يحتاج يعمل logout/login عشان يشوف اسمه الجديد
      await update({ name: body.data.name, image: body.data.image });
      setSuccess(true);
      setSubmitting(false);

    } catch { setError(requestFailureMessage()); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink">{t("name")}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          className="w-full rounded-md border border-steel/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-ink">
          {t("picture")}
        </label>
        <ImageUploader value={image} onChange={setImage} folder="avatars" />
      </div>

      {error && <p className="text-sm text-alert">{error}</p>}
      {success && <p className="text-sm text-signal">{t("profileUpdated")}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90 disabled:opacity-40"
      >
        {submitting ? t("saving") : t("saveChanges")}
      </button>
    </form>
  );
}
