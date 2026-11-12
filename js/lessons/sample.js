// Local demonstration only. Real lessons always come from Strapi unless ?demo=1 is in the URL.
const paragraph = (text) => ({ type: "paragraph", children: [{ type: "text", text }] });
export const SAMPLE_LESSONS = [
  {
    id: "sample-notation", slug: "osnovna-notacija", title: "Osnovna notacija",
    description: "Kako čitati oznake poteza i pratiti demonstracije.", order: 10,
    sections: [
      { __component: "lesson.text", heading: "Kako čitamo algoritme?", body: [
        paragraph("Za svaki potez koristimo oznaku strane kocke: R, L, U, D, F ili B. Apostrof označava obrnuti smjer, a broj 2 okret od 180°."),
        paragraph("Poteze uvijek promatramo gledajući izravno u stranu koju okrećemo.")
      ] },
      { __component: "lesson.image", heading: "Šest strana kocke", image: { url: "./img/cube-notation.svg", alternativeText: "Oznake U, R, F, D, L i B na kocki" }, body: [
        paragraph("U = gornja, D = donja, F = prednja, B = stražnja, R = desna, L = lijeva strana."),
      ] },
      { __component: "lesson.cube", heading: "Prvi algoritam", setupAlg: "F U R U'", alg: "R U R' U'", body: [
        paragraph("Ovaj niz naziva se desni okidač (right trigger). Pokušaj ga izvesti na kocki.")
      ] }
    ]
  },
  {
    id: "sample-cross", slug: "bijeli-kriz", title: "Bijeli križ",
    description: "Uvod u slaganje bijelog križa na 3×3×3.", order: 20,
    sections: [
      { __component: "lesson.text", heading: "Cilj: bijeli križ", body: [
        paragraph("Pronađi četiri bijela bridna dijela i složi ih oko bijelog centra. Obrati pozornost i na boju bočnih naljepnica."),
        paragraph("Nije važno koji se primjer nalazi na kocki dok objašnjavaš postupak; live način pokazuje tvoje stvarne poteze.")
      ] },
      { __component: "lesson.cube", heading: "Demonstracija poteza", setupAlg: "R U F R' U2", alg: "F' U R U' R' F", body: [
        paragraph("Promatraj kako se položaj bridnih dijelova mijenja nakon svakog poteza.")
      ] }
    ]
  }
];
