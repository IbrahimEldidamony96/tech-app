"use client";
import { requestFailureMessage } from "@/lib/request-error";

import { useState } from "react";
import { useTranslations } from "next-intl";

type OptionValue = { id: string; valueEn: string; valueAr: string };
export type OptionWithValues = {
  id: string;
  nameEn: string;
  nameAr: string;
  values: OptionValue[];
};

const emptyOption = { nameEn: "", nameAr: "" };
const emptyValue = { valueEn: "", valueAr: "" };

export function OptionsManager({
  productId,
  options,
  setOptions,
}: {
  productId: string;
  options: OptionWithValues[];
  setOptions: React.Dispatch<React.SetStateAction<OptionWithValues[]>>;
}) {
  const t = useTranslations("AdminOptions");
  const [newOption, setNewOption] = useState(emptyOption);
  const [newValues, setNewValues] = useState<
    Record<string, { valueEn: string; valueAr: string }>
  >({});
  const [error, setError] = useState("");

  async function addOption(e: React.FormEvent) {
    try {
      e.preventDefault();
      setError("");

      const res = await fetch(`/api/products/${productId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOption),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("addOptionFailed"));
        return;
      }

      const body = await res.json();
      setOptions((prev) => [...prev, { ...body.data, values: [] }]);
      setNewOption(emptyOption);

    } catch { setError(requestFailureMessage()); }

  }

  // بيتنادى onBlur — يعني بيتحفظ لما تسيب الخانة، مش مع كل حرف
  async function renameOption(
    optionId: string,
    field: "nameEn" | "nameAr",
    value: string,
  ) {
    try {
      setError("");
      const res = await fetch(`/api/products/${productId}/options/${optionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("renameOptionFailed"));
        return;
      }

      setOptions((prev) =>
        prev.map((o) => (o.id === optionId ? { ...o, [field]: value } : o)),
      );

    } catch { setError(requestFailureMessage()); }

  }

  async function renameValue(
    optionId: string,
    valueId: string,
    field: "valueEn" | "valueAr",
    value: string,
  ) {
    try {
      setError("");
      const res = await fetch(
        `/api/products/${productId}/options/${optionId}/values/${valueId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("renameValueFailed"));
        return;
      }

      setOptions((prev) =>
        prev.map((o) =>
          o.id === optionId
            ? {
                ...o,
                values: o.values.map((v) =>
                  v.id === valueId ? { ...v, [field]: value } : v,
                ),
              }
            : o,
        ),
      );

    } catch { setError(requestFailureMessage()); }

  }

  async function addValue(optionId: string) {
    try {
      setError("");
      const draft = newValues[optionId] ?? emptyValue;
      if (!draft.valueEn || !draft.valueAr) {
        setError(t("fillBothValues"));
        return;
      }

      const res = await fetch(
        `/api/products/${productId}/options/${optionId}/values`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? t("addValueFailed"));
        return;
      }

      const body = await res.json();
      setOptions((prev) =>
        prev.map((o) =>
          o.id === optionId ? { ...o, values: [...o.values, body.data] } : o,
        ),
      );
      setNewValues((prev) => ({ ...prev, [optionId]: emptyValue }));

    } catch { setError(requestFailureMessage()); }

  }

  return (
    <div className="mt-8 rounded-lg border border-steel/15 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-steel">
        {t("title")}
      </p>
      <p className="mt-1 text-xs text-steel">
        {t("hint")}
      </p>

      {options.map((option) => (
        <div key={option.id} className="mt-4 border-t border-steel/10 pt-4">
          <div className="flex gap-2">
            <input
              defaultValue={option.nameEn}
              dir="ltr"
              onBlur={(e) =>
                e.target.value !== option.nameEn &&
                renameOption(option.id, "nameEn", e.target.value)
              }
              className="rounded border border-steel/15 px-2 py-1 text-sm font-medium text-ink focus:border-ink"
            />
            <input
              defaultValue={option.nameAr}
              dir="rtl"
              onBlur={(e) =>
                e.target.value !== option.nameAr &&
                renameOption(option.id, "nameAr", e.target.value)
              }
              className="rounded border border-steel/15 px-2 py-1 text-sm text-ink focus:border-ink"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {option.values.map((v) => (
              <div key={v.id} className="flex gap-1">
                <input
                  defaultValue={v.valueEn}
                  dir="ltr"
                  onBlur={(e) =>
                    e.target.value !== v.valueEn &&
                    renameValue(option.id, v.id, "valueEn", e.target.value)
                  }
                  className="w-20 rounded bg-steel/10 px-2 py-1 text-xs text-ink focus:bg-steel/20"
                />
                <input
                  defaultValue={v.valueAr}
                  dir="rtl"
                  onBlur={(e) =>
                    e.target.value !== v.valueAr &&
                    renameValue(option.id, v.id, "valueAr", e.target.value)
                  }
                  className="w-20 rounded bg-steel/10 px-2 py-1 text-xs text-ink focus:bg-steel/20"
                />
              </div>
            ))}
            {option.values.length === 0 && (
              <span className="text-xs text-steel">{t("noValues")}</span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <input
              placeholder={t("valueEnPlaceholder")}
              dir="ltr"
              value={newValues[option.id]?.valueEn ?? ""}
              onChange={(e) =>
                setNewValues((prev) => ({
                  ...prev,
                  [option.id]: {
                    valueEn: e.target.value,
                    valueAr: prev[option.id]?.valueAr ?? "",
                  },
                }))
              }
              className="w-28 rounded-md border border-steel/25 px-2 py-1 text-xs"
            />
            <input
              placeholder="القيمة (عربي)"
              dir="rtl"
              value={newValues[option.id]?.valueAr ?? ""}
              onChange={(e) =>
                setNewValues((prev) => ({
                  ...prev,
                  [option.id]: {
                    valueEn: prev[option.id]?.valueEn ?? "",
                    valueAr: e.target.value,
                  },
                }))
              }
              className="w-28 rounded-md border border-steel/25 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => addValue(option.id)}
              className="rounded-md bg-ink px-3 py-1 text-xs text-paper"
            >
              {t("addValue")}
            </button>
          </div>
        </div>
      ))}

      <form
        onSubmit={addOption}
        className="mt-4 flex flex-wrap gap-2 border-t border-steel/10 pt-4"
      >
        <input
          required
          placeholder={t("optionNamePlaceholder")}
          dir="ltr"
          value={newOption.nameEn}
          onChange={(e) =>
            setNewOption((p) => ({ ...p, nameEn: e.target.value }))
          }
          className="w-40 rounded-md border border-steel/25 px-2 py-1 text-xs"
        />
        <input
          required
          placeholder="اسم الخاصية (عربي)"
          dir="rtl"
          value={newOption.nameAr}
          onChange={(e) =>
            setNewOption((p) => ({ ...p, nameAr: e.target.value }))
          }
          className="w-40 rounded-md border border-steel/25 px-2 py-1 text-xs"
        />
        <button
          type="submit"
          className="rounded-md bg-ink px-3 py-1 text-xs font-semibold text-paper"
        >
          {t("addOption")}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-alert">{error}</p>}
    </div>
  );
}
