use rand::Rng;

const ADJECTIVES: &[&str] = &[
    "brave", "calm", "clever", "cosmic", "crisp", "daring", "eager", "fair", "fierce", "gentle",
    "golden", "happy", "hidden", "keen", "kind", "lively", "lucky", "mellow", "mighty", "noble",
    "peaceful", "proud", "quick", "quiet", "rapid", "rustic", "sharp", "silent", "smooth", "snowy",
    "solar", "steady", "stellar", "stormy", "swift", "tidal", "vivid", "warm", "wild", "wise",
];

const NOUNS: &[&str] = &[
    "aurora", "badger", "canyon", "cedar", "comet", "coral", "crane", "dusk", "eagle", "ember",
    "falcon", "fern", "flame", "fox", "glacier", "grove", "hawk", "heron", "jade", "lake", "lark",
    "luna", "maple", "mesa", "nebula", "oak", "orchid", "otter", "peak", "pine", "quartz", "raven",
    "reef", "ridge", "river", "sage", "sierra", "sparrow", "summit", "wolf",
];

pub fn generate_name() -> String {
    let mut rng = rand::thread_rng();
    let adj = ADJECTIVES[rng.gen_range(0..ADJECTIVES.len())];
    let noun = NOUNS[rng.gen_range(0..NOUNS.len())];
    format!("{}-{}", adj, noun)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_name_format() {
        let name = generate_name();
        let parts: Vec<&str> = name.split('-').collect();
        assert_eq!(parts.len(), 2);
        assert!(ADJECTIVES.contains(&parts[0]));
        assert!(NOUNS.contains(&parts[1]));
    }

    #[test]
    fn generate_name_not_empty() {
        let name = generate_name();
        assert!(!name.is_empty());
        assert!(name.len() > 3);
    }

    #[test]
    fn generate_name_variety() {
        let names: std::collections::HashSet<String> = (0..20).map(|_| generate_name()).collect();
        assert!(names.len() > 1);
    }

    #[test]
    fn adjectives_all_lowercase() {
        for adj in ADJECTIVES {
            assert_eq!(*adj, adj.to_lowercase());
        }
    }

    #[test]
    fn nouns_all_lowercase() {
        for noun in NOUNS {
            assert_eq!(*noun, noun.to_lowercase());
        }
    }
}
