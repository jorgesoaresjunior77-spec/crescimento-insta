/**
 * `public/world-countries.json` (topojson do world-atlas, malha "countries-110m") expõe
 * apenas o código numérico ISO 3166-1 de cada país em `id` — não a sigla alpha-2 usada
 * nos dados de audiência. Este mapa (gerado a partir da lista pública ISO 3166 mantida em
 * github.com/lukes/ISO-3166-Countries-with-Regional-Codes) faz a ponte entre as duas
 * representações, no mesmo espírito de `ibgeStates.ts` para os estados do Brasil.
 *
 * 3 territórios do topojson não têm código numérico ISO 3166-1 (Chipre do Norte,
 * Somalilândia, Kosovo) e por isso ficam de fora deste mapa — sempre renderizados como
 * "sem dado" no mapa mundi.
 */
export const ISO_NUMERIC_TO_ALPHA2: Record<string, string> = {
  "242": "FJ", "834": "TZ", "732": "EH", "124": "CA", "840": "US", "398": "KZ",
  "860": "UZ", "598": "PG", "360": "ID", "32": "AR", "152": "CL", "180": "CD",
  "706": "SO", "404": "KE", "729": "SD", "148": "TD", "332": "HT", "214": "DO",
  "643": "RU", "44": "BS", "238": "FK", "578": "NO", "304": "GL", "260": "TF",
  "626": "TL", "710": "ZA", "426": "LS", "484": "MX", "858": "UY", "76": "BR",
  "68": "BO", "604": "PE", "170": "CO", "591": "PA", "188": "CR", "558": "NI",
  "340": "HN", "222": "SV", "320": "GT", "84": "BZ", "862": "VE", "328": "GY",
  "740": "SR", "250": "FR", "218": "EC", "630": "PR", "388": "JM", "192": "CU",
  "716": "ZW", "72": "BW", "516": "NA", "686": "SN", "466": "ML", "478": "MR",
  "204": "BJ", "562": "NE", "566": "NG", "120": "CM", "768": "TG", "288": "GH",
  "384": "CI", "324": "GN", "624": "GW", "430": "LR", "694": "SL", "854": "BF",
  "140": "CF", "178": "CG", "266": "GA", "226": "GQ", "894": "ZM", "454": "MW",
  "508": "MZ", "748": "SZ", "24": "AO", "108": "BI", "376": "IL", "422": "LB",
  "450": "MG", "275": "PS", "270": "GM", "788": "TN", "12": "DZ", "400": "JO",
  "784": "AE", "634": "QA", "414": "KW", "368": "IQ", "512": "OM", "548": "VU",
  "116": "KH", "764": "TH", "418": "LA", "104": "MM", "704": "VN", "408": "KP",
  "410": "KR", "496": "MN", "356": "IN", "50": "BD", "64": "BT", "524": "NP",
  "586": "PK", "4": "AF", "762": "TJ", "417": "KG", "795": "TM", "364": "IR",
  "760": "SY", "51": "AM", "752": "SE", "112": "BY", "804": "UA", "616": "PL",
  "40": "AT", "348": "HU", "498": "MD", "642": "RO", "440": "LT", "428": "LV",
  "233": "EE", "276": "DE", "100": "BG", "300": "GR", "792": "TR", "8": "AL",
  "191": "HR", "756": "CH", "442": "LU", "56": "BE", "528": "NL", "620": "PT",
  "724": "ES", "372": "IE", "540": "NC", "90": "SB", "554": "NZ", "36": "AU",
  "144": "LK", "156": "CN", "158": "TW", "380": "IT", "208": "DK", "826": "GB",
  "352": "IS", "31": "AZ", "268": "GE", "608": "PH", "458": "MY", "96": "BN",
  "705": "SI", "246": "FI", "703": "SK", "203": "CZ", "232": "ER", "392": "JP",
  "600": "PY", "887": "YE", "682": "SA", "10": "AQ", "196": "CY", "504": "MA",
  "818": "EG", "434": "LY", "231": "ET", "262": "DJ", "800": "UG", "646": "RW",
  "70": "BA", "807": "MK", "688": "RS", "499": "ME", "780": "TT", "728": "SS",
}

export interface CountryOption {
  value: string
  label: string
}

/**
 * Lista curta usada no formulário/testes (países mais comuns para um público brasileiro).
 * Não é a lista completa de ~174 países do mapa mundi — o mapa aceita qualquer alpha-2
 * presente em `ISO_NUMERIC_TO_ALPHA2`; esta lista serve apenas de atalho na UI.
 */
export const COMMON_COUNTRIES: CountryOption[] = [
  { value: "BR", label: "Brasil" },
  { value: "PT", label: "Portugal" },
  { value: "AR", label: "Argentina" },
  { value: "US", label: "Estados Unidos" },
  { value: "MX", label: "México" },
  { value: "CO", label: "Colômbia" },
  { value: "CL", label: "Chile" },
  { value: "PY", label: "Paraguai" },
  { value: "UY", label: "Uruguai" },
  { value: "ES", label: "Espanha" },
  { value: "IT", label: "Itália" },
  { value: "FR", label: "França" },
  { value: "DE", label: "Alemanha" },
  { value: "GB", label: "Reino Unido" },
  { value: "JP", label: "Japão" },
  { value: "AO", label: "Angola" },
  { value: "MZ", label: "Moçambique" },
]

export const COUNTRY_LABEL_BY_ALPHA2: Record<string, string> = Object.fromEntries(
  COMMON_COUNTRIES.map((c) => [c.value, c.label]),
)
