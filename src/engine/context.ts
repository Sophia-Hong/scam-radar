/** Remove only locally attributed quotation/negation spans from positive matching.
 * A bare quote is still a received message: quotation marks alone prove nothing.
 * Contrast boundaries stop a warning from shielding a new solicitation.
 */
const ATTRIBUTION = /\b(research|dataset|study|news|article|reported|warn(?:ing|s)?|scam|fraud|beware|if someone|do not reply|don't reply)\b|연구|데이터셋|기사|보도|경고|사기|속지|답하지|응답하지|조심/;
const WARNING = /\b(?:do not|don't|never) (?:pay|deposit|install|transfer)\b|\b(?:it's|that's|this is|that is) a scam\b|사기입니다|\b(beware|scam warning|fraud warning|scam alert|report and block|don't (?:reply|fall for)|do not (?:reply|fall for))\b|(?:원금\s*보장|손실\s*보전|확정\s*수익).{0,30}(?:불법|피하|주의)|조심하세요|속지\s*마|답하지\s*마|응답하지\s*마/;
const NEGATION = /\b(?:we|i|our (?:bot|service)) (?:do not|don't|never) (?:sell|offer|provide|promise|guarantee|recruit)\b|\b(?:returns?|profits?) (?:are |is )?not guaranteed\b|(?:판매|제공|모집|보장|권유|추천)\s*(?:하지\s*않|안\s*합)|(?:매수\s*신호|시그널|종목).{0,16}(?:팔지\s*않|판매하지\s*않)/;
const QUOTES = /"[^"\n]{3,1000}"|“[^”\n]{3,1000}”|‘[^’\n]{3,1000}’|「[^」\n]{3,1000}」|(?<!\w)'[^'\n]{3,1000}'(?!\w)/g;

export function activeContext(text: string): { text: string; excluded: string[] } {
  const excluded: string[] = [];
  const parts = text.split(/(\n+|[!?;]+|(?<!\d)\.(?=\s|$)|\bbut\b|\bhowever\b|하지만|그런데)/i);
  const result = parts.map((part) => {
    let active = part.replace(QUOTES, (quote, offset: number) => {
      const outside = part.slice(0, offset) + part.slice(offset + quote.length);
      if (!ATTRIBUTION.test(outside)) return quote;
      excluded.push(quote);
      return " ";
    });
    // Commas bound negation scope; a subsequent independent offer remains visible.
    active = active.split(/(,)/).map((clause) => {
      if (NEGATION.test(clause) || WARNING.test(clause)) {
        excluded.push(clause);
        return " ";
      }
      return clause;
    }).join("");
    return active;
  }).join("");
  return { text: result, excluded };
}
