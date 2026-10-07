"use client";

import { useEffect, useState } from "react";

export default function CountrySelect({
  id = "country",
  label = "Country",
  value,
  onChange,
  allowAny = false,
}) {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recipes?countries=1")
      .then(async (response) => {
        if (!response.ok) throw new Error("Country list request failed.");
        const data = await response.json();
        if (!Array.isArray(data.countries)) throw new Error("Country list was invalid.");
        if (!cancelled) setCountries(data.countries);
      })
      .catch((fetchError) => {
        console.error("Could not load recipe countries:", fetchError);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ width: "100%" }}>
      <label htmlFor={id} style={{ display: "block", fontWeight: "700", marginBottom: "8px" }}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={!allowAny}
        disabled={loading || error}
        style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text-main)" }}
      >
        <option value="">{loading ? "Loading countries..." : allowAny ? "All countries" : "Choose your country"}</option>
        {countries.map(({ country }) => <option key={country} value={country}>{country}</option>)}
      </select>
      {error && <p role="alert" style={{ color: "var(--text-muted)", margin: "8px 0 0", fontSize: "0.85rem" }}>Could not load countries. Refresh the page and try again.</p>}
    </div>
  );
}
