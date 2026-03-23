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
