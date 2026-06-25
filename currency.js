/* currency.js — 환율 환산 후처리 (BoothmateG CurrencyConverter 포팅)
   원본: BoothmateG/CurrencyConverter.swift v3.7.0 을 JS로 이식.
   환율 API: https://open.er-api.com/v6/latest/KRW  (CORS 허용, 키 불필요)
   번역 자막 텍스트에서 금액을 감지해 괄호로 환산값을 덧붙인다.
   예) "$24억" → "$24억(₩약 3조2160억원)",  "1조원" → "1조원($746.0 million)" */
(function (global) {
  "use strict";

  var CODES = ["USD", "EUR", "GBP", "JPY", "CNY"];

  // 1 통화단위당 원화(KRW) 값. fetchRates 실패 시 쓰는 기본값.
  var rates = { USD: 1340.0, EUR: 1460.0, GBP: 1700.0, JPY: 9.0, CNY: 185.0 };
  var lastUpdated = null;
  var isLoading = false;

  // [정규식용 기호, 통화코드]
  var symbolToCode = [
    ["\\$", "USD"],
    ["€", "EUR"],
    ["£", "GBP"],
    ["¥", "JPY"],
    ["元", "CNY"]
  ];

  // 숫자(쉼표/소수 포함) 캡처 조각
  var NUM = "(\\d+(?:,\\d+)*(?:\\.\\d+)?)";

  // ── 환율 가져오기 ──
  function fetchRates() {
    if (isLoading) return Promise.resolve();
    isLoading = true;
    return fetch("https://open.er-api.com/v6/latest/KRW")
      .then(function (r) { return r.json(); })
      .then(function (json) {
        var rd = json && json.rates;
        if (rd) {
          var nr = {};
          for (var i = 0; i < CODES.length; i++) {
            var code = CODES[i];
            var v = rd[code];
            if (typeof v === "number" && v > 0) nr[code] = 1.0 / v; // KRW 기준 → 원화/단위
          }
          if (Object.keys(nr).length) {
            rates = nr;
            lastUpdated = new Date();
          }
        }
      })
      .catch(function () { /* 실패 시 기본값 유지 */ })
      .then(function () { isLoading = false; });
  }

  // ── 괄호 안/이미 환산된 위치는 건너뛰며 정규식 치환 ──
  // build(match, groups) 가 null 반환 시 해당 매치는 그대로 둔다.
  function replaceGuarded(text, pattern, flags, build, afterSkip, beforeSkip) {
    var re = new RegExp(pattern, flags);
    return text.replace(re, function (match) {
      var args = arguments;
      var offset = args[args.length - 2];
      var full = args[args.length - 1];
      var groups = Array.prototype.slice.call(args, 1, args.length - 2);
      var after = full.slice(offset + match.length);
      // 바로 뒤가 '(' → 이미 환산됨
      if (after.charAt(0) === "(") return match;
      if (afterSkip && afterSkip(after)) return match;
      var before = full.slice(0, offset);
      if (beforeSkip && beforeSkip(before)) return match;
      // 앞쪽 괄호가 안 닫혔으면(= 괄호 주석 안) 건너뜀
      var open = 0, close = 0;
      for (var i = 0; i < before.length; i++) {
        var c = before.charAt(i);
        if (c === "(") open++;
        else if (c === ")") close++;
      }
      if (open > close) return match;
      var rep = build(match, groups);
      return rep == null ? match : rep;
    });
  }

  function toNum(s) {
    var n = parseFloat(String(s).replace(/,/g, ""));
    return isNaN(n) ? null : n;
  }
  function comma(n) { return Math.floor(n).toLocaleString("en-US"); }

  // ── 포맷터 ──
  function formatKRW(value) {
    if (value < 10000) return "₩" + comma(value);
    return "₩약 " + koreanNumber(value);
  }
  function formatKRWkorean(value) {
    var eok = 1e8, man = 1e4;
    if (value >= eok) {
      var e = Math.floor(value / eok);
      var m = Math.floor((value % eok) / man);
      var cheon = Math.floor(m / 1000);
      if (cheon > 0) return "₩" + e + "억" + cheon + "천만원";
      return "₩" + e + "억원";
    } else if (value >= man) {
      return "₩" + comma(Math.floor(value / man)) + "만원";
    }
    return "₩" + comma(value) + "원";
  }
  function formatUSDsimple(value) {
    if (value >= 1e9) return "$" + (value / 1e9).toFixed(1) + " billion";
    if (value >= 1e6) return "$" + (value / 1e6).toFixed(1) + " million";
    return "$" + comma(value);
  }
  function formatDollarKorean(value) {
    if (value >= 1e12) return "$" + (value / 1e12).toFixed(1) + "조";
    if (value >= 1e8) {
      var eok = Math.floor(value / 1e8);
      var man = Math.floor((value % 1e8) / 1e4);
      var cheon = Math.floor(man / 1000);
      if (cheon > 0) return "$" + eok + "억" + cheon + "천만";
      return "$" + eok + "억";
    }
    if (value >= 1e4) return "$" + comma(Math.floor(value / 1e4)) + "만";
    return "$" + comma(value);
  }
  function subUnit4(value) {
    if (value === 0) return "";
    var result = "";
    var cheon = Math.floor(value / 1000);
    var baek = Math.floor((value % 1000) / 100);
    if (cheon > 0) result += cheon + "천";
    if (baek > 0) result += baek + "백";
    return result;
  }
  function subUnit4Full(value) {
    if (value === 0) return "";
    return comma(value);
  }
  function koreanNumber(value) {
    var gyeong = 1e16, jo = 1e12, eok = 1e8, man = 1e4;
    if (value >= gyeong) {
      var g = Math.floor(value / gyeong);
      var j = Math.floor((value % gyeong) / jo);
      if (j > 0) return g + "경" + subUnit4(j) + "조원";
      return g + "경원";
    } else if (value >= jo) {
      var j2 = Math.floor(value / jo);
      var e = Math.floor((value % jo) / eok);
      if (e > 0) return j2 + "조" + subUnit4(e) + "억원";
      return j2 + "조원";
    } else if (value >= eok) {
      var e2 = Math.floor(value / eok);
      var m = Math.floor((value % eok) / man);
      if (m > 0) return e2 + "억" + subUnit4Full(m) + "만원";
      return e2 + "억원";
    } else if (value >= man) {
      return subUnit4Full(Math.floor(value / man)) + "만원";
    }
    return Math.floor(value) + "원";
  }

  // ── 1) 한국어: $숫자 + 조/억/만 ──
  function convertDollarKoreanUnit(text) {
    var usdRate = rates.USD;
    if (!usdRate || usdRate <= 0) return text;
    var out = text;
    var P = [["조", 1e12], ["억", 1e8], ["만", 1e4]];
    for (var i = 0; i < P.length; i++) {
      (function (unit, mult) {
        out = replaceGuarded(out, "\\$\\s*" + NUM + "\\s*" + unit, "g", function (m, g) {
          var a = toNum(g[0]); if (a == null) return null;
          var usd = a * mult, krw = usd * usdRate;
          return formatDollarKorean(usd) + "(" + formatKRW(krw) + ")";
        });
      })(P[i][0], P[i][1]);
    }
    return out;
  }

  // 헬퍼: 원화단위 → 달러
  function convertKRWUnit(text, pattern, multiplier, usdRate) {
    return replaceGuarded(text, pattern, "g", function (m, g) {
      var a = toNum(g[0]); if (a == null) return null;
      var usd = (a * multiplier) / usdRate;
      return m + "(" + formatUSDsimple(usd) + ")";
    });
  }

  // ── 2) 한국어: 원화 → 달러 ──
  function convertKRWtoUSD(text) {
    var usdRate = rates.USD;
    if (!usdRate || usdRate <= 0) return text;
    var out = text;
    out = convertKRWUnit(out, "₩?\\s*" + NUM + "\\s*조\\s*원", 1e12, usdRate);
    out = convertKRWUnit(out, "₩?\\s*" + NUM + "\\s*억\\s*원", 1e8, usdRate);
    out = convertKRWUnit(out, "₩?\\s*" + NUM + "\\s*만\\s*원", 1e4, usdRate);
    out = convertKRWUnit(out, "₩?\\s*" + NUM + "\\s*천\\s*원", 1e3, usdRate);
    out = convertKRWUnit(out, "₩\\s*" + NUM, 1, usdRate);
    // 큰 숫자(쉼표) + 원 → 한글단위 + USD
    out = replaceGuarded(out, "(\\d{1,3}(?:,\\d{3})+)\\s*원", "g", function (m, g) {
      var krw = toNum(g[0]); if (krw == null) return null;
      return formatKRWkorean(krw) + "(" + formatUSDsimple(krw / usdRate) + ")";
    });
    return out;
  }

  // ── 3) 한국어: 달러 표현 → 원화 환산 ──
  function convertKoreanDollar(text) {
    var usdRate = rates.USD;
    if (!usdRate || usdRate <= 0) return text;
    var out = text;
    var P = [["조", 1e12], ["억", 1e8], ["만", 1e4], ["천", 1e3]];
    for (var i = 0; i < P.length; i++) {
      (function (unit, mult) {
        out = replaceGuarded(out, NUM + "\\s*" + unit + "\\s*달러", "g", function (m, g) {
          var a = toNum(g[0]); if (a == null) return null;
          var usd = a * mult, krw = usd * usdRate;
          return m + "(" + formatKRW(krw) + ")";
        });
      })(P[i][0], P[i][1]);
    }
    // 큰 숫자(쉼표) + 달러
    out = replaceGuarded(out, "(\\d{1,3}(?:,\\d{3})+)\\s*달러", "g", function (m, g) {
      var usd = toNum(g[0]); if (usd == null) return null;
      return formatDollarKorean(usd) + "(" + formatKRW(usd * usdRate) + ")";
    });
    // 작은 숫자(쉼표 없음) + 달러
    out = replaceGuarded(out, "(\\d+(?:\\.\\d+)?)\\s*달러", "g", function (m, g) {
      var usd = toNum(g[0]); if (usd == null) return null;
      return m + "(" + formatKRW(usd * usdRate) + ")";
    });
    return out;
  }

  // ── 4) 영어: million/billion/trillion + 기호/단어 ──
  function convertLargeAmount(text) {
    var out = text, i;
    // 기호 + 숫자 + 단위
    var sym = [
      ["\\$", "USD", 1e12, "trillion"], ["\\$", "USD", 1e9, "billion"], ["\\$", "USD", 1e6, "million"],
      ["€", "EUR", 1e12, "trillion"], ["€", "EUR", 1e9, "billion"], ["€", "EUR", 1e6, "million"],
      ["£", "GBP", 1e12, "trillion"], ["£", "GBP", 1e9, "billion"], ["£", "GBP", 1e6, "million"]
    ];
    for (i = 0; i < sym.length; i++) {
      (function (s, code, mult, word) {
        var rate = rates[code]; if (!rate) return;
        out = replaceGuarded(out, s + "\\s*" + NUM + "\\s*" + word, "gi", function (m, g) {
          var a = toNum(g[0]); if (a == null) return null;
          return m + "(" + formatKRW(a * mult * rate) + ")";
        });
      })(sym[i][0], sym[i][1], sym[i][2], sym[i][3]);
    }
    // 숫자 + 단위 + dollars/euros/pounds
    var wp = [
      ["USD", 1e12, "trillion", "dollars"], ["USD", 1e9, "billion", "dollars"], ["USD", 1e6, "million", "dollars"],
      ["EUR", 1e12, "trillion", "euros"], ["EUR", 1e9, "billion", "euros"], ["EUR", 1e6, "million", "euros"],
      ["GBP", 1e12, "trillion", "pounds"], ["GBP", 1e9, "billion", "pounds"], ["GBP", 1e6, "million", "pounds"]
    ];
    for (i = 0; i < wp.length; i++) {
      (function (code, mult, big, cur) {
        var rate = rates[code]; if (!rate) return;
        out = replaceGuarded(out, NUM + "\\s*" + big + "\\s*" + cur, "gi", function (m, g) {
          var a = toNum(g[0]); if (a == null) return null;
          return m + "(" + formatKRW(a * mult * rate) + ")";
        });
      })(wp[i][0], wp[i][1], wp[i][2], wp[i][3]);
    }
    // 일반 숫자 + dollars/euros/pounds (million 등 없을 때)
    var pp = [["USD", "dollars"], ["EUR", "euros"], ["GBP", "pounds"]];
    for (i = 0; i < pp.length; i++) {
      (function (code, cur) {
        var rate = rates[code]; if (!rate) return;
        out = replaceGuarded(out, NUM + "\\s*" + cur, "gi",
          function (m, g) {
            var a = toNum(g[0]); if (a == null) return null;
            return m + "(" + formatKRW(a * rate) + ")";
          },
          null,
          function (before) {
            var lo = before.toLowerCase();
            return lo.lastIndexOf("million ") === lo.length - 8 ||
                   lo.lastIndexOf("billion ") === lo.length - 8 ||
                   lo.lastIndexOf("trillion ") === lo.length - 9;
          });
      })(pp[i][0], pp[i][1]);
    }
    return out;
  }

  // ── 5) 영어: 원화 표현 → 달러 ("20 million won" 등) ──
  function convertEnglishWon(text) {
    var usdRate = rates.USD;
    if (!usdRate || usdRate <= 0) return text;
    var out = text;
    var P = [["trillion", 1e12], ["billion", 1e9], ["million", 1e6]];
    for (var i = 0; i < P.length; i++) {
      (function (big, mult) {
        out = replaceGuarded(out, NUM + "\\s*" + big + "\\s*won", "gi", function (m, g) {
          var a = toNum(g[0]); if (a == null) return null;
          return m + "(" + formatUSDsimple((a * mult) / usdRate) + ")";
        });
      })(P[i][0], P[i][1]);
    }
    out = replaceGuarded(out, "(\\d{1,3}(?:,\\d{3})+)\\s*won", "gi", function (m, g) {
      var a = toNum(g[0]); if (a == null) return null;
      return m + "(" + formatUSDsimple(a / usdRate) + ")";
    });
    return out;
  }

  // ── 6) 영어: 외화 기호 → 원화 ──
  function convertForeignToKRW(text) {
    var out = text;
    for (var i = 0; i < symbolToCode.length; i++) {
      (function (sym, code) {
        var rate = rates[code]; if (!rate) return;
        out = replaceGuarded(out, sym + "\\s*" + NUM, "g",
          function (m, g) {
            var a = toNum(g[0]); if (a == null) return null;
            return m + "(" + formatKRW(a * rate) + ")";
          },
          function (after) {
            var lo = after.toLowerCase();
            if (lo.indexOf(" million") === 0 || lo.indexOf(" billion") === 0 || lo.indexOf(" trillio") === 0) return true;
            // 한국어 단위($24억 등)는 다른 단계에서 처리 → 건너뜀
            if (/^\s?[억조만]/.test(after)) return true;
            return false;
          });
      })(symbolToCode[i][0], symbolToCode[i][1]);
    }
    return out;
  }

  // ── 전체 적용 (원본 applyConversion 순서 그대로) ──
  function applyConversion(text) {
    if (!text) return text;
    var out = text;
    out = convertDollarKoreanUnit(out);
    out = convertKRWtoUSD(out);
    out = convertKoreanDollar(out);
    out = convertLargeAmount(out);
    out = convertEnglishWon(out);
    out = convertForeignToKRW(out);
    return out;
  }

  global.BoothmateCurrency = {
    fetchRates: fetchRates,
    applyConversion: applyConversion,
    getRates: function () { return rates; },
    getLastUpdated: function () { return lastUpdated; }
  };

  // 로드 시 환율 1회 갱신 (실패해도 기본값으로 동작)
  try { fetchRates(); } catch (e) {}

  // Node 환경(테스트)용
  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.BoothmateCurrency;
  }
})(typeof window !== "undefined" ? window : this);
