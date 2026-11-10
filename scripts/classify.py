"""Classify chemicals into the ChemStock taxonomy.

Two evidence sources, recorded per chemical in `source`:
  * "curated"   – laboratory role (solvent, coupling reagent, catalyst, ...) assigned by CAS number.
                  Roles cannot be derived from structure, so they come from this reviewed table.
  * "structure" – functional groups detected with RDKit SMARTS on the PubChem structure for the CAS.
Chemicals with neither a curated entry nor a verified PubChem structure are left Unclassified.
Hazards are deliberately NOT inferred here.

Output: data/classification.json  { cas: { categories[], chemical_class, tags[], synonyms[], source } }
"""

import json
from pathlib import Path

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")

ROOT = Path(__file__).resolve().parent.parent
PUBCHEM = json.loads((ROOT / "data" / "pubchem.json").read_text())
TAXONOMY = json.loads((ROOT / "data" / "taxonomy.json").read_text())
OUT = ROOT / "data" / "classification.json"

VALID = {c["slug"] for c in TAXONOMY} | {s["slug"] for c in TAXONOMY for s in c["children"]}

# CAS -> (categories, primary first; extra tags; curated abbreviations / common names)
C = {}


def cur(cas, cats, tags=(), syn=()):
    for c in cats:
        assert c in VALID, c
    C[cas] = (list(cats), list(tags), list(syn))


# --- Solvents ---------------------------------------------------------------
cur("75-05-8", ["polar-aprotic-solvents"], ["solvent"], ["MeCN", "ACN", "Methyl cyanide"])
cur("67-68-5", ["polar-aprotic-solvents"], ["solvent"], ["DMSO"])
cur("68-12-2", ["polar-aprotic-solvents"], ["solvent"], ["DMF", "N,N-Dimethylformamide"])
cur("67-64-1", ["polar-aprotic-solvents"], ["solvent"], ["Propanone"])
cur("109-99-9", ["polar-aprotic-solvents"], ["solvent", "ether"], ["THF"])
cur("75-52-5", ["polar-aprotic-solvents"], ["solvent", "nitro"], ["MeNO2"])
cur("872-50-4", ["polar-aprotic-solvents"], ["solvent"], ["NMP", "N-Methylpyrrolidone"])
cur("67-63-0", ["polar-protic-solvents"], ["solvent", "alcohol"], ["IPA", "2-Propanol", "Isopropyl alcohol"])
cur("75-65-0", ["polar-protic-solvents"], ["solvent", "alcohol"], ["t-BuOH", "tert-Butyl alcohol", "2-Methyl-2-propanol"])
cur("920-66-1", ["polar-protic-solvents", "halogenated-solvents"], ["solvent", "fluorinated"], ["HFIP", "Hexafluoroisopropanol"])
cur("64-19-7", ["organic-acids", "carboxylic-acids", "polar-protic-solvents"], ["solvent"], ["AcOH", "Glacial acetic acid", "Ethanoic acid"])
cur("123-91-1", ["non-polar-solvents"], ["solvent", "ether"], ["Dioxane", "p-Dioxane"])
cur("109-66-0", ["non-polar-solvents"], ["solvent", "hydrocarbon"], ["n-Pentane"])
cur("8032-32-4", ["non-polar-solvents"], ["solvent", "hydrocarbon", "mixture"], ["Pet ether", "PE", "Petroleum spirit", "Light petroleum"])
cur("108-88-3", ["non-polar-solvents"], ["solvent", "hydrocarbon"], ["PhMe", "Methylbenzene", "Toluol"])
cur("71-43-2", ["non-polar-solvents"], ["solvent", "hydrocarbon"], ["C6H6"])
cur("60-29-7", ["non-polar-solvents"], ["solvent", "ether"], ["Et2O", "Ether", "Ethyl ether"])
cur("109-87-5", ["non-polar-solvents"], ["solvent", "ether"], ["Methylal", "DMM"])
cur("107-46-0", ["non-polar-solvents"], ["solvent"], ["HMDSO", "HMDS(O)"])
cur("67-66-3", ["halogenated-solvents"], ["solvent", "chlorinated"], ["CHCl3", "Trichloromethane"])
cur("75-09-2", ["halogenated-solvents"], ["solvent", "chlorinated"], ["DCM", "Methylene chloride", "CH2Cl2"])
cur("98-08-8", ["halogenated-solvents", "aromatic-compounds"], ["solvent", "fluorinated", "trifluoromethyl"], ["PhCF3", "BTF", "Trifluorotoluene"])
cur("110-86-1", ["organic-bases", "polar-aprotic-solvents", "heterocyclic-compounds"], ["solvent", "base"], ["Py"])

# --- Bases ------------------------------------------------------------------
cur("121-44-8", ["organic-bases", "base-amines"], ["base", "tertiary amine"], ["TEA", "Et3N", "NEt3"])
cur("7087-68-5", ["organic-bases", "base-amines"], ["base", "tertiary amine"], ["DIPEA", "DIEA", "Hunig's base", "iPr2NEt"])
cur("1122-58-3", ["organocatalysts", "organic-bases"], ["base", "acylation catalyst"], ["DMAP", "4-Dimethylaminopyridine"])
cur("280-57-9", ["organic-bases", "organocatalysts"], ["base"], ["DABCO", "1,4-Diazabicyclo[2.2.2]octane", "Triethylenediamine"])
cur("6674-22-2", ["organic-bases"], ["base", "amidine"], ["DBU", "1,8-Diazabicyclo[5.4.0]undec-7-ene"])
cur("110-18-9", ["organic-bases", "ligands"], ["base", "tertiary amine"], ["TMEDA", "TEMED"])
cur("110-89-4", ["organic-bases", "heterocyclic-compounds"], ["base", "secondary amine"])
cur("123-75-1", ["organic-bases", "heterocyclic-compounds"], ["base", "secondary amine"])
cur("75-04-7", ["base-amines", "bb-amines"], ["primary amine"], ["EtNH2", "Aminoethane"])
cur("74-89-5", ["base-amines", "bb-amines"], ["primary amine"], ["MeNH2", "Aminomethane"])
cur("1336-21-6", ["inorganic-bases"], ["base", "aqueous solution"], ["NH4OH", "Aqueous ammonia", "Ammonia solution"])
cur("1310-58-3", ["inorganic-bases"], ["base"], ["KOH", "Caustic potash"])
cur("1310-73-2", ["inorganic-bases"], ["base"], ["NaOH", "Caustic soda"])
cur("1310-66-3", ["inorganic-bases"], ["base", "hydrate"], ["LiOH", "LiOH.H2O"])
cur("1305-62-0", ["inorganic-bases"], ["base"], ["Ca(OH)2", "Slaked lime"])
cur("584-08-7", ["inorganic-bases", "metal-salts"], ["base", "carbonate"], ["K2CO3", "Potash"])
cur("497-19-8", ["inorganic-bases", "metal-salts"], ["base", "carbonate"], ["Na2CO3", "Soda ash"])
cur("144-55-8", ["inorganic-bases", "metal-salts"], ["base", "carbonate"], ["NaHCO3", "Sodium hydrogen carbonate", "Baking soda"])
cur("7778-53-2", ["inorganic-bases", "metal-salts"], ["base", "phosphate"], ["K3PO4", "Tripotassium phosphate"])
cur("7646-69-7", ["inorganic-bases"], ["base", "hydride", "moisture sensitive"], ["NaH"])
cur("865-47-4", ["alkoxides", "organic-bases"], ["base", "moisture sensitive"], ["KOtBu", "tBuOK", "Potassium t-butoxide"])
cur("124-41-4", ["alkoxides"], ["base"], ["NaOMe", "Sodium methylate"])
cur("4111-54-0", ["organic-bases", "organometallic-reagents"], ["base", "lithium amide", "air sensitive"], ["LDA", "Lithium diisopropylamide"])

# --- Organometallics --------------------------------------------------------
cur("109-72-8", ["organometallic-reagents", "organic-bases"], ["organolithium", "air sensitive"], ["n-BuLi", "nBuLi", "Butyllithium", "BuLi"])
cur("917-54-4", ["organometallic-reagents"], ["organolithium", "air sensitive"], ["MeLi"])
cur("676-58-4", ["organometallic-reagents"], ["Grignard reagent", "air sensitive"], ["MeMgCl"])
cur("75-16-1", ["organometallic-reagents"], ["Grignard reagent", "air sensitive"], ["MeMgBr"])

# --- Acids ------------------------------------------------------------------
cur("7647-01-0", ["inorganic-acids"], ["acid", "solution"], ["HCl", "Hydrochloric acid"])
cur("7664-38-2", ["inorganic-acids"], ["acid"], ["H3PO4", "Phosphoric acid"])
cur("10450-60-9", ["inorganic-acids", "oxidizing-agents"], ["acid", "oxidant"], ["H5IO6", "Periodic acid"])
cur("6303-21-5", ["inorganic-acids", "reducing-agents"], ["acid"], ["H3PO2", "Hypophosphorous acid", "Phosphinic acid"])
cur("1493-13-6", ["sulfonic-acids", "organic-acids"], ["acid", "superacid", "fluorinated"], ["TfOH", "Triflic acid"])
cur("76-05-1", ["organic-acids", "carboxylic-acids", "deprotection-reagents"], ["acid", "fluorinated", "Boc removal"], ["TFA", "Trifluoroacetic acid"])

# --- Alkylating -------------------------------------------------------------
cur("77-78-1", ["alkylating-agents"], ["methylating agent"], ["DMS", "Me2SO4"])
cur("74-88-4", ["alkylating-agents"], ["methylating agent", "iodinated"], ["MeI", "Iodomethane"])
cur("74-96-4", ["alkylating-agents"], ["brominated"], ["EtBr", "Bromoethane"])
cur("100-39-0", ["alkylating-agents", "halogenated-compounds"], ["benzylic halide", "brominated"], ["BnBr"])
cur("106-96-7", ["alkylating-agents", "alkynes"], ["brominated", "alkyne"], ["3-Bromopropyne"])
cur("106-93-4", ["alkylating-agents", "halogenated-compounds"], ["brominated"], ["EDB", "Ethylene dibromide"])
cur("51594-55-9", ["alkylating-agents"], ["epoxide", "chiral", "chlorinated"])

# --- Acylating --------------------------------------------------------------
cur("75-36-5", ["acylating-agents"], ["acid chloride", "moisture sensitive"], ["AcCl", "Ethanoyl chloride"])
cur("79-37-8", ["acylating-agents", "halogenating-agents"], ["acid chloride", "moisture sensitive"], ["(COCl)2"])
cur("598-21-0", ["acylating-agents", "alkylating-agents"], ["acid bromide", "brominated"])
cur("541-41-3", ["acylating-agents"], ["chloroformate"], ["ECF"])
cur("50893-53-3", ["acylating-agents", "deprotection-reagents"], ["chloroformate", "N-dealkylation"], ["ACE-Cl"])
cur("32315-10-9", ["acylating-agents"], ["phosgene equivalent"], ["BTC", "Bis(trichloromethyl) carbonate"])
cur("108-31-6", ["acylating-agents", "carboxylic-acid-derivatives"], ["anhydride"])
cur("85-44-9", ["acylating-agents", "carboxylic-acid-derivatives"], ["anhydride"])
cur("530-62-1", ["amide-coupling-reagents", "acylating-agents"], ["carbonyl transfer"], ["CDI", "Carbonyldiimidazole"])
cur("6160-65-2", ["acylating-agents"], ["thiocarbonyl transfer"], ["TCDI", "Thio-CDI", "1,1'-Thiocarbonyldiimidazole"])

# --- Halogenating -----------------------------------------------------------
cur("128-08-5", ["halogenating-agents"], ["brominating agent"], ["NBS"])
cur("516-12-1", ["halogenating-agents"], ["iodinating agent"], ["NIS"])
cur("128-09-6", ["halogenating-agents"], ["chlorinating agent"], ["NCS"])
cur("39416-48-3", ["halogenating-agents"], ["brominating agent"], ["PyHBr3", "Pyridinium perbromide"])
cur("15114-43-9", ["halogenating-agents"], ["brominating agent"], ["DBI"])
cur("7719-09-7", ["halogenating-agents"], ["chlorinating agent", "moisture sensitive"], ["SOCl2"])
cur("7789-60-8", ["halogenating-agents"], ["brominating agent", "moisture sensitive"], ["PBr3"])
cur("7553-56-2", ["halogenating-agents", "inorganic-compounds"], ["iodinating agent"], ["I2"])
cur("7789-45-9", ["halogenating-agents", "metal-salts"], ["brominating agent"], ["CuBr2"])

# --- Oxidising --------------------------------------------------------------
cur("7727-21-1", ["oxidizing-agents", "metal-salts"], ["oxidant", "persulfate"], ["K2S2O8", "Potassium peroxydisulfate"])
cur("937-14-4", ["oxidizing-agents"], ["oxidant", "peracid"], ["mCPBA", "m-CPBA", "meta-Chloroperbenzoic acid"])
cur("75-91-2", ["oxidizing-agents"], ["oxidant", "peroxide"], ["TBHP"])
cur("94-36-0", ["oxidizing-agents"], ["radical initiator", "peroxide"], ["BPO", "Dibenzoyl peroxide"])
cur("84-58-2", ["oxidizing-agents"], ["oxidant", "quinone"], ["DDQ"])
cur("2564-83-2", ["organocatalysts", "oxidizing-agents"], ["radical", "oxidation catalyst"], ["TEMPO"])
cur("1313-13-9", ["oxidizing-agents", "metal-oxides"], ["oxidant"], ["MnO2"])
cur("27126-76-7", ["oxidizing-agents"], ["hypervalent iodine"], ["HTIB", "Koser's reagent"])
cur("2712-78-9", ["oxidizing-agents"], ["hypervalent iodine"], ["PIDA", "PhI(OAc)2", "Iodobenzene diacetate", "DIB"])
cur("106-51-4", ["oxidizing-agents"], ["quinone"], ["1,4-Benzoquinone", "BQ"])
cur("524-38-9", ["organocatalysts"], ["oxidation catalyst"], ["NHPI"])

# --- Reducing ---------------------------------------------------------------
cur("16853-85-3", ["reducing-agents"], ["hydride", "moisture sensitive"], ["LAH", "LiAlH4", "Lithium tetrahydroaluminate"])
cur("56553-60-7", ["reducing-agents"], ["hydride", "reductive amination"], ["STAB", "NaBH(OAc)3"])
cur("1191-15-7", ["reducing-agents", "organometallic-reagents"], ["hydride", "air sensitive"], ["DIBAL", "DIBAL-H", "DIBALH"])
cur("7775-14-6", ["reducing-agents", "metal-salts"], ["reductant"], ["Na2S2O4", "Sodium hydrosulfite"])
cur("10025-69-1", ["reducing-agents", "metal-salts"], ["reductant", "hydrate"], ["SnCl2", "SnCl2.2H2O", "Stannous chloride"])
cur("7439-89-6", ["reducing-agents", "inorganic-compounds"], ["metal powder"], ["Fe", "Iron powder"])
cur("7803-57-8", ["reducing-agents"], ["hydrazine"], ["N2H4.H2O"])
cur("10217-52-4", ["reducing-agents"], ["hydrazine"], ["N2H4.H2O"])
cur("134-03-2", ["reducing-agents"], ["click chemistry"], ["NaAsc"])
cur("7772-98-7", ["reducing-agents", "metal-salts"], ["quench"], ["Na2S2O3", "Hypo"])

# --- Coupling ---------------------------------------------------------------
cur("25952-53-8", ["amide-coupling-reagents"], ["carbodiimide"], ["EDC", "EDCI", "EDC.HCl", "EDAC", "WSC"])
cur("2592-95-2", ["amide-coupling-reagents"], ["coupling additive"], ["HOBt"])
cur("148893-10-1", ["amide-coupling-reagents"], ["uronium salt"], ["HATU"])
cur("94790-37-1", ["amide-coupling-reagents"], ["uronium salt"], ["HBTU"])
cur("51364-51-3", ["metal-catalysts", "cross-coupling-reagents"], ["palladium", "air sensitive"], ["Pd2(dba)3", "Pd2dba3"])
cur("161265-03-8", ["ligands", "cross-coupling-reagents"], ["phosphine ligand"], ["Xantphos", "Xphos"])
cur("603-35-0", ["ligands", "organic-reagents"], ["phosphine", "Wittig / Mitsunobu"], ["PPh3", "TPP"])
cur("791-28-6", ["organic-reagents"], ["phosphine oxide"], ["TPPO", "Ph3PO"])
cur("7681-65-4", ["metal-catalysts", "cross-coupling-reagents", "metal-salts"], ["copper", "click chemistry"], ["CuI", "Copper(I) iodide", "Cuprous iodide"])
cur("98-80-6", ["cross-coupling-reagents", "aromatic-compounds"], ["boronic acid", "Suzuki"], ["PhB(OH)2", "Phenylboronic acid"])
cur("5419-55-6", ["cross-coupling-reagents"], ["borate ester", "borylation"], ["B(OiPr)3"])

# --- Catalysts --------------------------------------------------------------
cur("7440-05-3", ["metal-catalysts"], ["palladium", "heterogeneous", "hydrogenation"], ["Pd/C", "Palladium on carbon", "Pd-C"])
cur("54010-75-2", ["metal-catalysts", "metal-salts"], ["Lewis acid", "triflate"], ["Zn(OTf)2", "Zinc triflate"])
cur("7646-85-7", ["metal-catalysts", "metal-salts"], ["Lewis acid"], ["ZnCl2"])
cur("7705-08-0", ["metal-catalysts", "metal-salts"], ["Lewis acid"], ["FeCl3", "Ferric chloride"])
cur("10025-77-1", ["metal-salts", "metal-catalysts"], ["Lewis acid", "hydrate"], ["FeCl3.6H2O"])
cur("1333981-84-2", ["metal-catalysts"], ["ruthenium", "asymmetric transfer hydrogenation", "chiral"], ["Ts-DENEB"])
cur("1112-67-0", ["phase-transfer-catalysts"], ["quaternary ammonium"], ["TBAC", "Bu4NCl"])
cur("17455-13-9", ["phase-transfer-catalysts"], ["crown ether"], ["18C6"])
cur("147-85-3", ["organocatalysts", "heterocyclic-compounds"], ["amino acid", "chiral"], ["Pro", "Proline"])

# --- Protecting groups ------------------------------------------------------
cur("24424-99-5", ["boc-protection"], ["Boc"], ["Boc2O", "Boc anhydride", "Di-tert-butyl dicarbonate"])

# --- Azide / cyanide / misc reagents ---------------------------------------
cur("26628-22-8", ["inorganic-compounds", "organic-reagents"], ["azide"], ["NaN3"])
cur("4648-54-8", ["organic-reagents"], ["azide", "silyl"], ["TMSN3", "Azidotrimethylsilane"])
cur("7677-24-9", ["organic-reagents"], ["cyanide source", "silyl"], ["TMSCN"])
cur("100-97-0", ["organic-reagents", "heterocyclic-compounds"], ["formylation"], ["HMTA", "Hexamine", "Methenamine"])
cur("50-00-0", ["organic-reagents", "carbonyl-compounds"], ["aldehyde", "solution"], ["HCHO", "Formalin"])
cur("30525-89-4", ["organic-reagents", "carbonyl-compounds"], ["formaldehyde source"], ["PFA", "(CH2O)n"])
cur("123-63-7", ["organic-reagents"], ["acetaldehyde source"])
cur("4637-24-5", ["organic-reagents"], ["formylating agent", "acetal"], ["DMF-DMA", "DMFDMA"])
cur("1445-45-0", ["organic-reagents"], ["orthoester"], ["TMOA"])

# --- Chromatography / drying ------------------------------------------------
cur("112926-00-8", ["silica-gel"], ["chromatography"], ["SiO2", "Silica"])
cur("63231-67-4", ["silica-gel"], ["chromatography"], ["SiO2", "Silica"])
cur("1344-28-1", ["adsorbents", "metal-oxides"], ["chromatography"], ["Alumina", "Al2O3"])
cur("7757-82-6", ["drying-agents", "metal-salts"], ["anhydrous"], ["Na2SO4"])
cur("22189-08-8", ["drying-agents", "metal-salts"], ["hydrate"], ["MgSO4"])
cur("1344-01-0", ["drying-agents", "adsorbents"], ["molecular sieves"], ["Mol sieves", "MS 5A"])

# --- Analytical -------------------------------------------------------------
cur("130-22-3", ["indicators"], ["dye", "stain"], ["ARS"])
cur("143-74-8", ["indicators"], ["pH indicator", "dye"], ["Phenolsulfonphthalein"])
cur("17372-87-1", ["indicators"], ["dye", "stain"], ["Eosin Y"])
cur("119-26-6", ["indicators", "analytical-reagents"], ["TLC stain", "hydrazine"], ["DNPH", "2,4-DNPH", "Brady's reagent"])
cur("12054-85-2", ["indicators", "inorganic-compounds"], ["TLC stain"], ["AMT"])
cur("7791-13-1", ["metal-salts", "indicators"], ["hydrate", "moisture indicator"], ["CoCl2.6H2O"])

# --- Common inorganic salts (formula shortcuts) -----------------------------
for cas, syn in {
    "12125-02-9": ["NH4Cl", "Sal ammoniac"],
    "7647-14-5": ["NaCl", "Brine salt"],
    "7681-11-0": ["KI"],
    "7632-00-0": ["NaNO2"],
    "7758-99-8": ["CuSO4", "CuSO4.5H2O"],
    "10361-37-2": ["BaCl2"],
    "631-61-8": ["NH4OAc"],
    "127-08-2": ["KOAc"],
    "127-09-3": ["NaOAc"],
    "3396-11-0": ["CsOAc"],
    "13478-00-7": ["Ni(NO3)2"],
    "333-20-0": ["KSCN"],
    "1762-95-4": ["NH4SCN"],
    "590-28-3": ["KOCN"],
    "1074-82-4": ["Gabriel reagent"],
    "5470-11-1": ["NH2OH.HCl"],
    "10039-54-0": ["(NH2OH)2.H2SO4"],
}.items():
    C.setdefault(cas, ([], [], []))
    C[cas] = (C[cas][0], C[cas][1], C[cas][2] + syn)

# Products whose CAS-registered structure does not describe the stocked material.
MIXTURE_CAS = {"8032-32-4", "112926-00-8", "63231-67-4", "7440-05-3", "1344-01-0", "8004-13-5"}

S = {k: Chem.MolFromSmarts(v) for k, v in {
    "acid_chloride": "[CX3](=O)[Cl,Br]",
    "sulfonyl_chloride": "[SX4](=O)(=O)[Cl]",
    "anhydride": "[CX3](=O)[OX2][CX3](=O)",
    "carboxylic_acid": "[CX3](=O)[OX2H1,OX1-]",
    "sulfonic_acid": "[SX4](=O)(=O)[OX2H1]",
    "sulfonamide": "[SX4](=O)(=O)[NX3]",
    "ester": "[#6][CX3](=O)[OX2H0][#6]",
    "amide": "[NX3][CX3](=[OX1])[#6,#1]",
    "nitrile": "[NX1]#[CX2]",
    "aldehyde": "[CX3H1](=O)",
    "ketone": "[#6][CX3](=O)[#6]",
    "boronic": "[BX3]([OX2])[OX2]",
    "isothiocyanate": "N=C=S",
    "isocyanate": "N=C=O",
    "hydrazine": "[NX3][NX3]",
    "azide": "[N-]=[N+]=N",
    "nitro": "[N+](=O)[O-]",
    "aniline": "[NX3;H2,H1;!$(NC=O);!$(NS=O)]c",
    "primary_amine": "[NX3;H2;!$(NC=[O,S,N]);!$(NS=O);!$(N[N,O])][CX4]",
    "secondary_amine": "[NX3;H1;!$(NC=[O,S,N]);!$(NS=O);!$(N[N,O]);!$(Na)]([CX4])[CX4]",
    "tertiary_amine": "[NX3;H0;!$(NC=[O,S,N]);!$(NS=O);!$(N[N,O]);!$(Na);!$(N=*)]([#6])([#6])[#6]",
    "phenol": "[OX2H]c",
    "alcohol": "[OX2H][CX4]",
    "ether": "[OD2;!$(OC=O)]([#6])[#6]",
    "terminal_alkyne": "[CH]#[C]",
    "alkyne": "C#C",
    "epoxide": "C1OC1",
    "benzylic_halide": "c[CH2X4][Cl,Br,I]",
    "alpha_halo_carbonyl": "O=C[CX4;H1,H2][Cl,Br,I]",
    "alkyl_bromide_iodide": "[CH2X4,CH3X4][Br,I]",
    "aryl_halide": "c[F,Cl,Br,I]",
    "cf3": "C(F)(F)F",
    "boc": "CC(C)(C)OC(=O)N",
    "silyl": "[Si]",
}.items()}

GROUP_LABEL = [
    ("acid_chloride", "acid chloride"), ("sulfonyl_chloride", "sulfonyl chloride"),
    ("isothiocyanate", "isothiocyanate"), ("isocyanate", "isocyanate"), ("anhydride", "anhydride"),
    ("carboxylic_acid", "carboxylic acid"), ("sulfonic_acid", "sulfonic acid"),
    ("sulfonamide", "sulfonamide"), ("boronic", "boronic acid/ester"), ("ester", "ester"),
    ("amide", "amide"), ("nitrile", "nitrile"), ("aldehyde", "aldehyde"), ("ketone", "ketone"),
    ("hydrazine", "hydrazine"), ("aniline", "aniline"), ("primary_amine", "amine"),
    ("secondary_amine", "amine"), ("tertiary_amine", "amine"), ("phenol", "phenol"),
    ("alcohol", "alcohol"), ("terminal_alkyne", "alkyne"), ("alkyne", "alkyne"), ("epoxide", "epoxide"),
    ("benzylic_halide", "benzylic halide"), ("alkyl_bromide_iodide", "alkyl halide"),
    ("aryl_halide", "aryl halide"), ("nitro", "nitro compound"), ("ether", "ether"),
]
TAG_LABEL = {
    "aldehyde": "aldehyde", "ketone": "ketone", "carboxylic_acid": "carboxylic acid", "ester": "ester",
    "amide": "amide", "nitrile": "nitrile", "nitro": "nitro", "aniline": "aniline",
    "primary_amine": "primary amine", "secondary_amine": "secondary amine",
    "tertiary_amine": "tertiary amine", "phenol": "phenol", "alcohol": "alcohol", "ether": "ether",
    "terminal_alkyne": "terminal alkyne", "azide": "azide", "isocyanate": "isocyanate",
    "isothiocyanate": "isothiocyanate", "sulfonyl_chloride": "sulfonyl chloride",
    "sulfonamide": "sulfonamide", "boronic": "boronic acid", "epoxide": "epoxide",
    "hydrazine": "hydrazine", "acid_chloride": "acid chloride", "anhydride": "anhydride",
    "cf3": "trifluoromethyl", "boc": "Boc-protected", "silyl": "silyl", "benzylic_halide": "benzylic halide",
    "sulfonic_acid": "sulfonic acid",
}
METALS = set("Li Na K Rb Cs Be Mg Ca Sr Ba Al Ga In Sn Pb Bi Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg La Ce".split())


def is_inorganic(mol):
    carbons = [a for a in mol.GetAtoms() if a.GetSymbol() == "C"]
    if not carbons:
        return True
    for a in carbons:
        if a.GetTotalNumHs() > 0 or any(n.GetSymbol() in ("C", "H") for n in a.GetNeighbors()):
            return False
    return True  # carbonate / cyanide / thiocyanate type carbon only


def classify_structure(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    frags = sorted(Chem.GetMolFrags(mol, asMols=True), key=lambda m: m.GetNumHeavyAtoms(), reverse=True)
    main = frags[0]
    symbols = {a.GetSymbol() for a in mol.GetAtoms()}
    tags, cats = [], []

    if is_inorganic(mol):
        metals = symbols & METALS
        non_h = symbols - {"H"}
        if metals and non_h <= metals | {"O"} and "O" in non_h and not any(
            a.GetSymbol() == "O" and a.GetTotalNumHs() for a in mol.GetAtoms()
        ):
            cats = ["metal-oxides"]
            klass = "Metal oxide"
        elif metals and len(non_h) == 1:
            cats, klass = ["inorganic-compounds"], "Element"
        elif metals:
            cats, klass = ["metal-salts"], "Metal salt"
        elif any(a.GetFormalCharge() for a in mol.GetAtoms()):
            cats, klass = ["non-metal-salts"], "Non-metal salt"
        else:
            cats, klass = ["inorganic-compounds"], "Inorganic compound"
        if len(frags) > 1 and any(f.GetNumAtoms() == 1 and f.GetAtomWithIdx(0).GetSymbol() == "O" for f in frags):
            tags.append("hydrate")
        return cats, klass, tags

    hits = {k for k, p in S.items() if main.HasSubstructMatch(p)}
    if "terminal_alkyne" in hits:
        hits.discard("alkyne")
    cations = [f for f in frags[1:] if any(a.GetFormalCharge() > 0 for a in f.GetAtoms())]
    carboxylate_salt = bool(cations) and main.HasSubstructMatch(Chem.MolFromSmarts("[CX3](=O)[OX1-]"))
    if carboxylate_salt:
        hits.discard("carboxylic_acid")
    aromatic = any(a.GetIsAromatic() for a in main.GetAtoms())
    hetero_ring = any(a.IsInRing() and a.GetSymbol() not in ("C",) for a in main.GetAtoms())
    hetero_aromatic = any(a.GetIsAromatic() and a.GetSymbol() != "C" for a in main.GetAtoms())
    halogens = {s for s in ("F", "Cl", "Br", "I") if any(a.GetSymbol() == s for a in main.GetAtoms())}

    for k in hits:
        if k in TAG_LABEL:
            tags.append(TAG_LABEL[k])
    for h, t in (("F", "fluorinated"), ("Cl", "chlorinated"), ("Br", "brominated"), ("I", "iodinated")):
        if h in halogens:
            tags.append(t)
    if hetero_aromatic:
        tags.append("heteroaromatic")
    if "@" in smiles:
        tags.append("chiral")
    counter = [f for f in frags[1:] if f.GetNumAtoms() == 1]
    if any(f.GetAtomWithIdx(0).GetSymbol() == "Cl" for f in counter):
        tags.append("hydrochloride salt")
    if any(f.GetAtomWithIdx(0).GetSymbol() == "Br" for f in counter):
        tags.append("hydrobromide salt")
    if any(f.GetNumAtoms() == 1 and f.GetAtomWithIdx(0).GetSymbol() == "O" for f in frags[1:]):
        tags.append("hydrate")

    # building-block subcategories in priority order
    if hits & {"isocyanate", "isothiocyanate"}:
        cats.append("isocyanates-isothiocyanates")
    if "terminal_alkyne" in hits or "alkyne" in hits:
        cats.append("alkynes")
    if hetero_ring:
        cats.append("heterocyclic-compounds")
    if hits & {"aldehyde", "ketone"}:
        cats.append("carbonyl-compounds")
    if hits & {"aniline", "primary_amine", "secondary_amine"}:
        cats.append("bb-amines")
    if hits & {"ester", "amide", "nitrile", "anhydride", "acid_chloride"}:
        cats.append("carboxylic-acid-derivatives")
    if halogens:
        cats.append("halogenated-compounds")
    if aromatic and not hetero_ring:
        cats.append("aromatic-compounds")
    # reactivity-based secondary categories
    if "carboxylic_acid" in hits:
        cats.append("carboxylic-acids")
    if "sulfonic_acid" in hits:
        cats.append("sulfonic-acids")
    if "acid_chloride" in hits:
        cats.append("acylating-agents")
    if "sulfonyl_chloride" in hits:
        cats.append("sulfonylating-agents")
    if hits & {"benzylic_halide", "alpha_halo_carbonyl", "alkyl_bromide_iodide"}:
        cats.append("alkylating-agents")
    if "boronic" in hits:
        cats.append("cross-coupling-reagents")
    if carboxylate_salt:
        metal_cation = any(a.GetSymbol() in METALS for f in cations for a in f.GetAtoms())
        cats.insert(0, "metal-salts" if metal_cation else "non-metal-salts")
        tags.append("carboxylate salt")

    group = next((label for key, label in GROUP_LABEL if key in hits), None)
    if carboxylate_salt:
        group = "carboxylate salt"
    ring = main.GetRingInfo().NumRings() > 0
    prefix = (
        "Heteroaromatic" if hetero_aromatic else "Heterocyclic" if hetero_ring else "Aromatic" if aromatic else "Alicyclic" if ring else "Aliphatic"
    )
    if group:
        klass = f"{prefix} {group}"
    else:
        klass = f"{prefix} hydrocarbon" if symbols <= {"C", "H"} else f"{prefix} compound"
    return cats, klass, sorted(set(tags))


def dedupe(seq):
    seen, out = set(), []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def main():
    result = {}
    stats = {"curated": 0, "structure": 0, "unclassified": 0}
    all_cas = set(PUBCHEM) | set(C)
    for cas in sorted(all_cas):
        pc = PUBCHEM.get(cas)
        curated = C.get(cas)
        struct = None
        if pc and pc.get("smiles") and cas not in MIXTURE_CAS:
            struct = classify_structure(pc["smiles"])
        cats, tags, syn, klass = [], [], [], None
        if curated and curated[0]:
            cats += curated[0]
            source = "curated"
        if curated:
            tags += curated[1]
            syn += curated[2]
        if struct:
            s_cats, s_klass, s_tags = struct
            klass = s_klass
            tags += s_tags
            # curated roles are authoritative; structure only adds categories for uncurated chemicals
            if not (curated and curated[0]):
                cats += s_cats
                source = "structure"
        if not cats:
            source = "unclassified"
            cats = ["unclassified"]
        cats = dedupe(cats)[:4]
        stats[source] += 1
        result[cas] = {
            "categories": cats,
            "chemical_class": klass,
            "tags": dedupe(tags)[:10],
            "synonyms": dedupe(syn),
            "source": source,
            "mixture": cas in MIXTURE_CAS,
        }
    OUT.write_text(json.dumps(result, indent=1))
    print(stats)


if __name__ == "__main__":
    main()
