import type { Locale } from "~/lib/realtime/catalog";

const bands = (colors: string[], vertical = false) =>
  colors.map((fill, index) => (
    <rect
      key={index}
      fill={fill}
      x={vertical ? (index * 30) / colors.length : 0}
      y={vertical ? 0 : (index * 20) / colors.length}
      width={vertical ? 30 / colors.length : 30}
      height={vertical ? 20 : 20 / colors.length}
    />
  ));

function artwork(locale: Locale) {
  switch (locale) {
    case "de-de":
      return bands(["#222", "#d33c38", "#f0c34d"]);
    case "de-at":
      return bands(["#d33c38", "#fff", "#d33c38"]);
    case "fr-fr":
      return bands(["#234b9a", "#fff", "#d33c38"], true);
    case "it-it":
      return bands(["#278454", "#fff", "#d33c38"], true);
    case "nl-nl":
      return bands(["#c53939", "#fff", "#29569a"]);
    case "pl-pl":
      return bands(["#fff", "#d33c53"]);
    case "es-es":
      return (
        <>
          <rect width="30" height="20" fill="#bf3038" />
          <rect y="5" width="30" height="10" fill="#f2c34a" />
        </>
      );
    case "da-dk":
    case "nb-no":
    case "fi-fi":
    case "sv-se": {
      const base =
        locale === "fi-fi"
          ? "#fff"
          : locale === "sv-se"
            ? "#28669b"
            : "#c63843";
      const cross =
        locale === "fi-fi"
          ? "#28558b"
          : locale === "sv-se"
            ? "#f2c34a"
            : "#fff";
      return (
        <>
          <rect width="30" height="20" fill={base} />
          <path
            d="M10 0v20M0 10h30"
            stroke={cross}
            strokeWidth={locale === "nb-no" ? 6 : 4}
          />
          {locale === "nb-no" && (
            <path d="M10 0v20M0 10h30" stroke="#284b80" strokeWidth="3" />
          )}
        </>
      );
    }
    case "en-gb":
      return (
        <>
          <rect width="30" height="20" fill="#294677" />
          <path d="m0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="5" />
          <path d="m0 0 30 20M30 0 0 20" stroke="#cc3c46" strokeWidth="2" />
          <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="7" />
          <path d="M15 0v20M0 10h30" stroke="#cc3c46" strokeWidth="4" />
        </>
      );
    case "en-us":
      return (
        <>
          <rect width="30" height="20" fill="#fff" />
          {Array.from({ length: 7 }, (_, index) => (
            <rect
              key={index}
              y={(index * 40) / 13}
              width="30"
              height={20 / 13}
              fill="#c64149"
            />
          ))}
          <rect width="13" height={140 / 13} fill="#294677" />
          {Array.from({ length: 9 }, (_, row) =>
            Array.from({ length: row % 2 ? 5 : 6 }, (_, col) => (
              <circle
                key={`${row}-${col}`}
                cx={1.1 + col * 2.15 + (row % 2 ? 1.075 : 0)}
                cy={1 + row * 1.1}
                r=".38"
                fill="#fff"
              />
            )),
          )}
        </>
      );
  }
}

export function CountryFlag({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 30 20"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {artwork(locale)}
    </svg>
  );
}
