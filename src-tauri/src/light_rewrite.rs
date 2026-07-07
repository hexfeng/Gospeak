#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRewriteContext {
    pub profile_mode: String,
    pub selected_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LightRewriteOutput {
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LightRewriteDecision {
    Local(LightRewriteOutput),
    NeedsModel(LightRewriteReason),
    NoSpeech,
    NotApplicable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LightRewriteReason {
    LongText,
    SemanticList,
}

#[cfg(test)]
impl LightRewriteContext {
    pub fn normal() -> Self {
        Self {
            profile_mode: "normal".to_string(),
            selected_text: None,
        }
    }

    pub fn prompt() -> Self {
        Self {
            profile_mode: "prompt".to_string(),
            selected_text: None,
        }
    }
}

#[cfg(test)]
impl LightRewriteDecision {
    fn unwrap(self) -> LightRewriteOutput {
        match self {
            LightRewriteDecision::Local(output) => output,
            other => panic!("expected local light rewrite output, got {other:?}"),
        }
    }

    fn is_none(&self) -> bool {
        matches!(self, LightRewriteDecision::NotApplicable)
    }
}

pub fn light_rewrite(transcript: &str, context: &LightRewriteContext) -> LightRewriteDecision {
    if context.selected_text.is_some() {
        return LightRewriteDecision::NotApplicable;
    }

    let mode = context.profile_mode.trim().to_ascii_lowercase();
    if mode != "normal" && mode != "plain" {
        return LightRewriteDecision::NotApplicable;
    }

    let transcript = transcript.trim();
    if transcript.is_empty() {
        return LightRewriteDecision::NoSpeech;
    }

    let text = clean_text(transcript);
    if is_no_speech_text(&text) {
        return LightRewriteDecision::NoSpeech;
    }

    if has_list_hint(&text) || has_ordered_list_markers(&text) {
        if let Some(text) = format_list(&text) {
            return LightRewriteDecision::Local(LightRewriteOutput { text });
        }
    }

    if has_semantic_list_hint(&text) {
        return LightRewriteDecision::NeedsModel(LightRewriteReason::SemanticList);
    }

    if too_long(&text) {
        return LightRewriteDecision::NeedsModel(LightRewriteReason::LongText);
    }

    LightRewriteDecision::Local(LightRewriteOutput {
        text: finish_sentence(&add_conservative_punctuation(&text)),
    })
}

fn too_long(text: &str) -> bool {
    let visible = text.chars().filter(|ch| !ch.is_whitespace()).count();
    visible > 100
}

fn clean_text(text: &str) -> String {
    let mut text = text.to_string();
    for filler in ["\u{55ef}", "\u{5443}"] {
        text = text.replace(filler, "");
    }

    let mut words = Vec::new();
    let mut last = String::new();
    for word in text.split_whitespace() {
        let core = word
            .trim_matches(|ch: char| ch.is_ascii_punctuation())
            .to_ascii_lowercase();
        if matches!(core.as_str(), "um" | "uh" | "\u{90a3}\u{4e2a}") {
            continue;
        }
        if !last.is_empty() && last == core {
            continue;
        }
        last = core;
        words.push(word);
    }

    normalize_spaces_and_punctuation(&words.join(" "))
}

fn is_no_speech_text(text: &str) -> bool {
    text.trim().is_empty()
        || !text
            .chars()
            .any(|ch| ch.is_ascii_alphanumeric() || is_cjk(ch))
}

fn normalize_spaces_and_punctuation(text: &str) -> String {
    let cjk = text.chars().any(is_cjk);
    let mut out = String::new();
    let chars: Vec<char> = text.chars().collect();

    for (index, ch) in chars.iter().enumerate() {
        if ch.is_whitespace() {
            let prev = out.chars().last();
            let next = chars[index + 1..].iter().find(|next| !next.is_whitespace());
            if prev.is_none()
                || prev.is_some_and(is_cjk_or_punctuation)
                || next.is_some_and(|next| is_cjk_or_punctuation(*next))
            {
                continue;
            }
            if !out.ends_with(' ') {
                out.push(' ');
            }
            continue;
        }

        let ch = if cjk {
            match ch {
                ',' => '\u{ff0c}',
                _ => *ch,
            }
        } else {
            *ch
        };

        if out
            .chars()
            .last()
            .is_some_and(|last| same_punctuation_group(last, ch))
        {
            continue;
        }
        if is_punctuation(ch) && out.ends_with(' ') {
            out.pop();
        }
        out.push(ch);
    }

    out.trim().to_string()
}

fn add_conservative_punctuation(text: &str) -> String {
    if !text.chars().any(is_cjk) {
        return text.to_string();
    }

    let mut out = text.to_string();
    for connector in [
        "\u{7136}\u{540e}",
        "\u{53e6}\u{5916}",
        "\u{8fd8}\u{6709}",
        "\u{4f46}\u{662f}",
        "\u{6240}\u{4ee5}",
        "\u{63a5}\u{7740}",
        "\u{540c}\u{65f6}",
        "\u{4e0d}\u{8fc7}",
    ] {
        out = add_comma_before_connector(&out, connector);
    }
    out
}

fn add_comma_before_connector(text: &str, connector: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(index) = rest.find(connector) {
        let (before, after) = rest.split_at(index);
        out.push_str(before);
        if !out.is_empty()
            && !out
                .chars()
                .last()
                .is_some_and(|ch| is_punctuation(ch) || ch.is_whitespace())
        {
            out.push('\u{ff0c}');
        }
        out.push_str(connector);
        rest = &after[connector.len()..];
    }
    out.push_str(rest);
    out
}

fn finish_sentence(text: &str) -> String {
    let mut text = fix_english_i(text);
    if !text.chars().last().is_some_and(is_terminal_punctuation) {
        text.push(if is_cjk_question(&text) {
            '\u{ff1f}'
        } else if text.chars().any(is_cjk) {
            '\u{3002}'
        } else {
            '.'
        });
    }
    capitalize_first_ascii(&text)
}

fn fix_english_i(text: &str) -> String {
    text.split_whitespace()
        .map(|word| {
            let start = word
                .find(|ch: char| ch.is_ascii_alphanumeric())
                .unwrap_or(0);
            let end = word
                .rfind(|ch: char| ch.is_ascii_alphanumeric())
                .map(|index| index + 1)
                .unwrap_or(word.len());
            if word[start..end].eq_ignore_ascii_case("i") {
                format!("{}I{}", &word[..start], &word[end..])
            } else {
                word.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn capitalize_first_ascii(text: &str) -> String {
    for (index, ch) in text.char_indices() {
        if ch.is_ascii_alphabetic() {
            let mut out = String::new();
            out.push_str(&text[..index]);
            out.push(ch.to_ascii_uppercase());
            out.push_str(&text[index + ch.len_utf8()..]);
            return out;
        }
    }
    text.to_string()
}

fn has_list_hint(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ["todo", "list", "items", "steps"]
        .iter()
        .any(|hint| contains_ascii_word(&lower, hint))
        || [
            "\u{4ee3}\u{529e}",
            "\u{5f85}\u{529e}",
            "\u{6e05}\u{5355}",
            "\u{6b65}\u{9aa4}",
            "\u{51e0}\u{70b9}",
            "\u{51e0}\u{4e2a}\u{70b9}",
            "\u{51e0}\u{6761}",
        ]
        .iter()
        .any(|hint| text.contains(hint))
}

fn has_semantic_list_hint(text: &str) -> bool {
    [
        "\u{5305}\u{62ec}",
        "\u{5206}\u{522b}",
        "\u{4e3b}\u{8981}\u{6709}",
        "\u{5982}\u{4e0b}",
        "\u{4ee5}\u{4e0b}",
        "\u{6709}\u{51e0}\u{4e2a}\u{70b9}",
        "\u{6709}\u{51e0}\u{70b9}",
    ]
    .iter()
    .any(|hint| text.contains(hint))
}

fn contains_ascii_word(text: &str, needle: &str) -> bool {
    text.match_indices(needle)
        .any(|(index, _)| word_boundary(text, index, index + needle.len()))
}

fn has_ordered_list_markers(text: &str) -> bool {
    if !text.chars().any(is_cjk) {
        return false;
    }
    let markers = find_markers_with_options(text, false);
    is_ordered_list(&markers) || (!markers.is_empty() && is_ordered_list(&find_markers(text)))
}

fn is_ordered_list(markers: &[Marker]) -> bool {
    markers.len() >= 2
        && markers
            .iter()
            .enumerate()
            .all(|(index, marker)| marker.number == index + 1)
}

fn format_list(text: &str) -> Option<String> {
    let markers = find_markers(text);
    if markers.len() < 2 {
        return None;
    }

    let mut lines = Vec::new();
    let intro = text[..markers[0].start].trim_matches(|ch: char| {
        ch.is_whitespace() || matches!(ch, ':' | '\u{ff1a}' | ',' | '\u{ff0c}' | '.' | '\u{3002}')
    });
    if !intro.is_empty() {
        lines.push(intro.to_string());
    }
    for (index, marker) in markers.iter().enumerate() {
        let expected = index + 1;
        if marker.number != expected {
            return None;
        }
        let end = markers
            .get(index + 1)
            .map(|next| next.start)
            .unwrap_or(text.len());
        let item = clean_list_item(text[marker.end..end].trim_matches(|ch: char| {
            ch.is_whitespace()
                || matches!(ch, ':' | '\u{ff1a}' | ',' | '\u{ff0c}' | '.' | '\u{3002}')
        }));
        if item.is_empty() {
            return None;
        }
        lines.push(format!("{expected}. {item}"));
    }

    Some(lines.join("\n"))
}

fn clean_list_item(item: &str) -> String {
    let mut item = item.trim();
    loop {
        let next = item
            .strip_prefix('\u{662f}')
            .or_else(|| item.strip_prefix("\u{5c31}\u{662f}"))
            .or_else(|| item.strip_prefix("\u{8fd9}\u{4e2a}"))
            .map(str::trim);
        match next {
            Some(value) if value != item => item = value,
            _ => break,
        }
    }
    item.replace("\u{8fd9}\u{4e2a}", "")
}

#[derive(Debug)]
struct Marker {
    number: usize,
    start: usize,
    end: usize,
}

fn find_markers(text: &str) -> Vec<Marker> {
    let markers = find_markers_with_options(text, false);
    if markers.len() >= 2 {
        return markers;
    }
    find_markers_with_options(text, true)
}

fn find_markers_with_options(text: &str, allow_bare_chinese: bool) -> Vec<Marker> {
    let mut markers = Vec::new();
    let mut skip_until = 0;
    for (index, _) in text.char_indices() {
        if index < skip_until {
            continue;
        }
        if let Some((number, len)) = marker_at(text, index, allow_bare_chinese) {
            skip_until = index + len;
            markers.push(Marker {
                number,
                start: index,
                end: index + len,
            });
        }
    }
    markers
}

fn marker_at(text: &str, index: usize, allow_bare_chinese: bool) -> Option<(usize, usize)> {
    let tail = &text[index..];
    if let Some(marker) = chinese_marker_at(tail, allow_bare_chinese) {
        return Some(marker);
    }

    for (marker, number) in [
        ("one", 1),
        ("two", 2),
        ("three", 3),
        ("four", 4),
        ("five", 5),
    ] {
        if tail
            .get(..marker.len())
            .is_some_and(|candidate| candidate.eq_ignore_ascii_case(marker))
            && word_boundary(text, index, index + marker.len())
        {
            return Some((number, marker.len()));
        }
    }

    let ch = tail.chars().next()?;
    if ('1'..='5').contains(&ch) && word_boundary(text, index, index + 1) {
        let mut len = 1;
        if tail[1..].starts_with(['.', ')']) {
            len = 2;
        }
        return Some((ch as usize - '0' as usize, len));
    }

    None
}

fn chinese_marker_at(text: &str, allow_bare: bool) -> Option<(usize, usize)> {
    let mut chars = text.char_indices();
    let (_, first) = chars.next()?;
    if first == '\u{7b2c}' {
        let (number_start, number_char) = chars.next()?;
        let number = chinese_digit(number_char).or_else(|| {
            number_char
                .to_digit(10)
                .filter(|number| *number > 0)
                .map(|number| number as usize)
        })?;
        let mut end = number_start + number_char.len_utf8();
        if let Some((suffix_start, suffix)) = chars.next() {
            if matches!(suffix, '\u{4e2a}' | '\u{70b9}' | '\u{9879}' | '\u{6761}') {
                end = suffix_start + suffix.len_utf8();
            }
        }
        return Some((number, end));
    }

    if !allow_bare {
        return None;
    }
    let number = chinese_digit(first)?;
    if let Some((_, next)) = chars.next() {
        if matches!(
            next,
            '\u{5171}'
                | '\u{5341}'
                | '\u{767e}'
                | '\u{5343}'
                | '\u{4e07}'
                | '\u{70b9}'
                | '\u{53f7}'
                | '\u{4e2a}'
                | '\u{4e0b}'
                | '\u{9879}'
                | '\u{6708}'
                | '\u{5b63}'
                | '\u{5e74}'
                | '\u{5143}'
        ) {
            return None;
        }
    }
    Some((number, first.len_utf8()))
}

fn chinese_digit(ch: char) -> Option<usize> {
    match ch {
        '\u{4e00}' => Some(1),
        '\u{4e8c}' => Some(2),
        '\u{4e09}' => Some(3),
        '\u{56db}' => Some(4),
        '\u{4e94}' => Some(5),
        '\u{516d}' => Some(6),
        '\u{4e03}' => Some(7),
        '\u{516b}' => Some(8),
        '\u{4e5d}' => Some(9),
        _ => None,
    }
}

fn word_boundary(text: &str, start: usize, end: usize) -> bool {
    let before = text[..start].chars().last();
    let after = text[end..].chars().next();
    before.map_or(true, |ch| !ch.is_ascii_alphanumeric())
        && after.map_or(true, |ch| !ch.is_ascii_alphanumeric())
}

fn is_cjk(ch: char) -> bool {
    matches!(ch, '\u{4e00}'..='\u{9fff}')
}

fn is_cjk_question(text: &str) -> bool {
    let text = text.trim_end();
    text.ends_with(['\u{5417}', '\u{5462}', '\u{5565}'])
        || text.ends_with("\u{4ec0}\u{4e48}")
        || text.ends_with("\u{600e}\u{4e48}")
        || text.starts_with("\u{4e3a}\u{4ec0}\u{4e48}")
        || text.starts_with("\u{600e}\u{4e48}")
}

fn is_cjk_or_punctuation(ch: char) -> bool {
    is_cjk(ch) || is_punctuation(ch)
}

fn is_punctuation(ch: char) -> bool {
    matches!(
        ch,
        ',' | '.'
            | '!'
            | '?'
            | ':'
            | ';'
            | '\u{ff0c}'
            | '\u{3002}'
            | '\u{ff01}'
            | '\u{ff1f}'
            | '\u{ff1a}'
            | '\u{ff1b}'
            | '\u{3001}'
    )
}

fn is_terminal_punctuation(ch: char) -> bool {
    matches!(ch, '.' | '!' | '?' | '\u{3002}' | '\u{ff01}' | '\u{ff1f}')
}

fn same_punctuation_group(a: char, b: char) -> bool {
    punctuation_group(a).is_some() && punctuation_group(a) == punctuation_group(b)
}

fn punctuation_group(ch: char) -> Option<u8> {
    match ch {
        ',' | '\u{ff0c}' | '\u{3001}' => Some(1),
        '.' | '\u{3002}' => Some(2),
        '!' | '\u{ff01}' => Some(3),
        '?' | '\u{ff1f}' => Some(4),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_obvious_fillers_and_repairs_punctuation() {
        let input = "\u{55ef} \u{90a3}\u{4e2a} \u{4eca}\u{5929}\u{5f00}\u{4f1a}\u{ff0c}\u{ff0c}\u{5c31}\u{662f}\u{8ba8}\u{8bba}\u{4e00}\u{4e0b}\u{9879}\u{76ee}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{4eca}\u{5929}\u{5f00}\u{4f1a}\u{ff0c}\u{5c31}\u{662f}\u{8ba8}\u{8bba}\u{4e00}\u{4e0b}\u{9879}\u{76ee}\u{3002}"
        );
    }

    #[test]
    fn formats_explicit_todo_enumeration() {
        let input = "\u{4ee3}\u{529e}\u{4e8b}\u{9879}\u{7b2c}\u{4e00}\u{4e70}\u{725b}\u{5976}\u{7b2c}\u{4e8c}\u{56de}\u{590d}\u{90ae}\u{4ef6}\u{7b2c}\u{4e09}\u{9884}\u{7ea6}\u{4f1a}\u{8bae}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{4ee3}\u{529e}\u{4e8b}\u{9879}\n1. \u{4e70}\u{725b}\u{5976}\n2. \u{56de}\u{590d}\u{90ae}\u{4ef6}\n3. \u{9884}\u{7ea6}\u{4f1a}\u{8bae}"
        );
    }

    #[test]
    fn formats_long_explicit_chinese_change_list() {
        let input = "\u{51e0}\u{70b9}\u{4fee}\u{6539},\u{7b2c}\u{4e00}\u{4e2a}UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784},\u{7b2c}\u{4e8c}\u{4e2a}\u{662f}\u{8fd9}\u{4e2a}logo\u{9700}\u{8981}\u{91cd}\u{65b0}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684},\u{7b2c}\u{4e09}\u{4e2a}\u{662f}\u{73b0}\u{5728}\u{8fd9}\u{4e2a}\u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{8fd9}\u{4e2a}\u{56fe}\u{6807}\u{60ac}\u{6d6e}\u{7a97}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{51e0}\u{70b9}\u{4fee}\u{6539}\n1. UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784}\n2. logo\u{9700}\u{8981}\u{91cd}\u{65b0}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684}\n3. \u{73b0}\u{5728}\u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{56fe}\u{6807}\u{60ac}\u{6d6e}\u{7a97}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}"
        );
    }

    #[test]
    fn formats_chinese_ordinal_markers_without_suffix() {
        let input = "\u{51e0}\u{70b9}\u{4fee}\u{6539}\u{7b2c}\u{4e00}UI\u{91cd}\u{6784}\u{7b2c}\u{4e8c}logo\u{66ff}\u{6362}\u{7b2c}\u{4e09}\u{56fe}\u{6807}\u{91cd}\u{505a}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{51e0}\u{70b9}\u{4fee}\u{6539}\n1. UI\u{91cd}\u{6784}\n2. logo\u{66ff}\u{6362}\n3. \u{56fe}\u{6807}\u{91cd}\u{505a}"
        );
    }

    #[test]
    fn formats_bare_chinese_numeral_markers_with_strong_hint() {
        let input = "\u{51e0}\u{70b9}\u{4fee}\u{6539}\u{4e00}UI\u{91cd}\u{6784}\u{4e8c}logo\u{66ff}\u{6362}\u{4e09}\u{56fe}\u{6807}\u{91cd}\u{505a}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{51e0}\u{70b9}\u{4fee}\u{6539}\n1. UI\u{91cd}\u{6784}\n2. logo\u{66ff}\u{6362}\n3. \u{56fe}\u{6807}\u{91cd}\u{505a}"
        );
    }

    #[test]
    fn formats_bare_chinese_numeral_markers_after_ge_ji_dian_hint() {
        let input = "\u{51e0}\u{4e2a}\u{70b9}\u{5e2e}\u{6211}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\u{4e00},UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784}\u{4e8c},logo\u{9700}\u{8981}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684}\u{4e09},\u{5c31}\u{662f}\u{8fd9}\u{4e2a}\u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{60ac}\u{6d6e}\u{7a97}\u{7684}\u{56fe}\u{6807}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{51e0}\u{4e2a}\u{70b9}\u{5e2e}\u{6211}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\n1. UI\u{9700}\u{8981}\u{5168}\u{90e8}\u{91cd}\u{6784}\n2. logo\u{9700}\u{8981}\u{6362}\u{4e00}\u{4e2a}\u{65b0}\u{7684}\n3. \u{76d1}\u{542c}\u{72b6}\u{6001}\u{7684}\u{60ac}\u{6d6e}\u{7a97}\u{7684}\u{56fe}\u{6807}\u{8981}\u{91cd}\u{65b0}\u{505a}\u{4e00}\u{4e0b}"
        );
    }

    #[test]
    fn keeps_intro_before_numbered_list() {
        let input = "\u{51e0}\u{4e2a}\u{70b9}\u{786e}\u{8ba4}\u{4e00}\u{4e0b}\u{ff0c}1.\u{4ee3}\u{529e}\u{ff0c}2\u{90ae}\u{4ef6}\u{ff0c}3\u{5730}\u{5740}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{51e0}\u{4e2a}\u{70b9}\u{786e}\u{8ba4}\u{4e00}\u{4e0b}\n1. \u{4ee3}\u{529e}\n2. \u{90ae}\u{4ef6}\n3. \u{5730}\u{5740}"
        );
    }

    #[test]
    fn semantic_list_hint_requires_model_when_markers_are_missing() {
        let input = "\u{4eca}\u{5929}\u{4e3b}\u{8981}\u{5305}\u{62ec}\u{56fe}\u{7247}\u{90ae}\u{4ef6}\u{548c}\u{5730}\u{5740}";

        assert_eq!(
            light_rewrite(input, &LightRewriteContext::normal()),
            LightRewriteDecision::NeedsModel(LightRewriteReason::SemanticList)
        );
    }

    #[test]
    fn long_fast_text_requires_model() {
        let input = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

        assert_eq!(
            light_rewrite(input, &LightRewriteContext::normal()),
            LightRewriteDecision::NeedsModel(LightRewriteReason::LongText)
        );
    }

    #[test]
    fn medium_fast_text_stays_local_under_new_limit() {
        let input = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef";

        assert!(matches!(
            light_rewrite(input, &LightRewriteContext::normal()),
            LightRewriteDecision::Local(_)
        ));
    }

    #[test]
    fn filler_only_transcript_is_no_speech() {
        assert_eq!(
            light_rewrite("\u{55ef} \u{5443}", &LightRewriteContext::normal()),
            LightRewriteDecision::NoSpeech
        );
    }

    #[test]
    fn formats_chinese_ordinal_list_without_hint() {
        let input = "\u{6d4b}\u{8bd5}\u{4e00}\u{4e0b}\u{529f}\u{80fd}\u{ff0c}\u{7b2c}\u{4e00}\u{56fe}\u{7247}\u{ff0c}\u{7b2c}\u{4e8c}\u{90ae}\u{4ef6}\u{ff0c}\u{7b2c}\u{4e09}\u{5730}\u{5740}\u{3002}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{6d4b}\u{8bd5}\u{4e00}\u{4e0b}\u{529f}\u{80fd}\n1. \u{56fe}\u{7247}\n2. \u{90ae}\u{4ef6}\n3. \u{5730}\u{5740}"
        );
    }

    #[test]
    fn formats_chinese_ordinal_list_with_ge_suffix_and_mixed_case_items() {
        let input = "\u{51e0}\u{4e2a}\u{4fee}\u{6539}\u{70b9}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\u{ff0c}\u{7b2c}\u{4e00}\u{4e2a}Logo\u{ff0c}\u{7b2c}\u{4e8c}\u{4e2a}UI\u{ff0c}\u{7b2c}\u{4e09}\u{6587}\u{4ef6}\u{3002}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{51e0}\u{4e2a}\u{4fee}\u{6539}\u{70b9}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\n1. Logo\n2. UI\n3. \u{6587}\u{4ef6}"
        );
    }

    #[test]
    fn formats_arabic_digit_chinese_ordinal_list() {
        let input = "\u{51e0}\u{4e2a}\u{4fee}\u{6539}\u{70b9}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\u{ff0c}\u{7b2c}1\u{4e2a}Logo\u{ff0c}\u{7b2c}2\u{4e2a}UI\u{ff0c}\u{7b2c}3\u{6587}\u{4ef6}\u{3002}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{51e0}\u{4e2a}\u{4fee}\u{6539}\u{70b9}\u{8bb0}\u{5f55}\u{4e00}\u{4e0b}\n1. Logo\n2. UI\n3. \u{6587}\u{4ef6}"
        );
    }

    #[test]
    fn formats_mixed_chinese_marker_list_without_hint() {
        let input = "\u{6d4b}\u{8bd5}\u{4e00}\u{4e0b}\u{529f}\u{80fd}\u{ff0c}\u{4e00}\u{56fe}\u{7247}\u{ff0c}\u{7b2c}\u{4e8c}\u{90ae}\u{4ef6}\u{ff0c}\u{4e09}\u{5730}\u{5740}\u{3002}";
        let output = light_rewrite(input, &LightRewriteContext::normal()).unwrap();

        assert_eq!(
            output.text,
            "\u{6d4b}\u{8bd5}\u{4e00}\u{4e0b}\u{529f}\u{80fd}\n1. \u{56fe}\u{7247}\n2. \u{90ae}\u{4ef6}\n3. \u{5730}\u{5740}"
        );
    }

    #[test]
    fn keeps_decimal_dot_in_cjk_text() {
        let output = light_rewrite(
            "\u{4eca}\u{5929} 3.5 \u{5143}",
            &LightRewriteContext::normal(),
        )
        .unwrap();

        assert!(output.text.contains("3.5"));
        assert!(!output.text.contains("3\u{3002}5"));
    }

    #[test]
    fn keeps_domain_dot_in_cjk_text() {
        let output = light_rewrite(
            "example.com \u{53d1}\u{7ed9}\u{6211}",
            &LightRewriteContext::normal(),
        )
        .unwrap();

        assert!(output.text.to_ascii_lowercase().contains("example.com"));
        assert!(!output.text.contains("example\u{3002}com"));
    }

    #[test]
    fn does_not_format_bare_chinese_numerals_as_list_markers() {
        let output = light_rewrite(
            "\u{6e05}\u{5355}\u{4e00}\u{5171}\u{4e8c}\u{5341}\u{9879}",
            &LightRewriteContext::normal(),
        )
        .unwrap();
        assert!(!output.text.starts_with("1. "));
    }

    #[test]
    fn keeps_semantic_chinese_nage() {
        let output = light_rewrite(
            "\u{628a}\u{90a3}\u{4e2a}\u{6587}\u{4ef6}\u{53d1}\u{7ed9}\u{6211}",
            &LightRewriteContext::normal(),
        )
        .unwrap();

        assert_eq!(
            output.text,
            "\u{628a}\u{90a3}\u{4e2a}\u{6587}\u{4ef6}\u{53d1}\u{7ed9}\u{6211}\u{3002}"
        );
    }

    #[test]
    fn does_not_format_weak_chinese_items_hint_as_list() {
        let output = light_rewrite(
            "\u{4e8b}\u{9879}\u{4e00}\u{5207}\u{987a}\u{5229}\u{4e8c}\u{5b63}\u{5ea6}\u{76ee}\u{6807}\u{4e0d}\u{53d8}",
            &LightRewriteContext::normal(),
        )
        .unwrap();

        assert_eq!(
            output.text,
            "\u{4e8b}\u{9879}\u{4e00}\u{5207}\u{987a}\u{5229}\u{4e8c}\u{5b63}\u{5ea6}\u{76ee}\u{6807}\u{4e0d}\u{53d8}\u{3002}"
        );
    }

    #[test]
    fn keeps_bare_you_in_plain_english() {
        let output = light_rewrite("you are right", &LightRewriteContext::normal()).unwrap();

        assert_eq!(output.text, "You are right.");
    }

    #[test]
    fn keeps_bare_like_in_plain_english() {
        let output = light_rewrite("i like rust", &LightRewriteContext::normal()).unwrap();

        assert_eq!(output.text, "I like rust.");
    }

    #[test]
    fn keeps_semantic_chinese_jiushi() {
        let output = light_rewrite(
            "\u{7b54}\u{6848}\u{5c31}\u{662f}42",
            &LightRewriteContext::normal(),
        )
        .unwrap();

        assert_eq!(output.text, "\u{7b54}\u{6848}\u{5c31}\u{662f}42\u{3002}");
    }

    #[test]
    fn keeps_chinese_statement_with_question_word_as_statement() {
        let output = light_rewrite(
            "\u{6211}\u{4e0d}\u{77e5}\u{9053}\u{4ec0}\u{4e48}\u{539f}\u{56e0}",
            &LightRewriteContext::normal(),
        )
        .unwrap();

        assert_eq!(
            output.text,
            "\u{6211}\u{4e0d}\u{77e5}\u{9053}\u{4ec0}\u{4e48}\u{539f}\u{56e0}\u{3002}"
        );
    }

    #[test]
    fn keeps_you_know_when_semantic() {
        let output = light_rewrite("you know the answer", &LightRewriteContext::normal()).unwrap();

        assert_eq!(output.text, "You know the answer.");
    }

    #[test]
    fn list_hint_requires_a_word_boundary() {
        let output = light_rewrite(
            "listen to one song and two podcasts",
            &LightRewriteContext::normal(),
        )
        .unwrap();

        assert_eq!(output.text, "Listen to one song and two podcasts.");
    }

    #[test]
    fn does_not_guess_prompt_profile_structure() {
        let output = light_rewrite(
            "write a plan with goal and constraints",
            &LightRewriteContext::prompt(),
        );
        assert!(output.is_none());
    }

    #[test]
    fn selected_text_keeps_speak_to_edit_on_llm_path() {
        let output = light_rewrite(
            "\u{4fee}\u{6539}\u{8fd9}\u{53e5}\u{8bdd}",
            &LightRewriteContext {
                profile_mode: "normal".to_string(),
                selected_text: Some("\u{539f}\u{6587}".to_string()),
            },
        );
        assert!(output.is_none());
    }
}
