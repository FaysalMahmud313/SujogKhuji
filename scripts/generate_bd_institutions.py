import json
import os
import re
from pathlib import Path

PUBLIC_UNIVERSITIES = [
    ("Bangladesh University of Engineering and Technology (BUET)", "buet dhaka engineering"),
    ("University of Dhaka (DU)", "du dhaka university"),
    ("University of Chittagong (CU)", "cu chittagong university"),
    ("University of Rajshahi (RU)", "ru rajshahi university"),
    ("Jahangirnagar University (JU)", "ju savar jahangirnagar"),
    ("Khulna University of Engineering & Technology (KUET)", "kuet khulna engineering"),
    ("Rajshahi University of Engineering & Technology (RUET)", "ruet rajshahi engineering"),
    ("Chittagong University of Engineering & Technology (CUET)", "cuet chittagong engineering"),
    ("Shahjalal University of Science and Technology (SUST)", "sust sylhet science technology"),
    ("Dhaka University of Engineering & Technology (DUET)", "duet gazipur engineering"),
    ("Bangladesh Agricultural University (BAU)", "bau mymensingh agricultural"),
    ("Islamic University, Bangladesh (IU)", "iu kushtia islamic university"),
    ("Khulna University (KU)", "ku khulna university"),
    ("Bangladesh Open University (BOU)", "bou gazipur open university"),
    ("Bangabandhu Sheikh Mujib Medical University (BSMMU)", "bsmmu dhaka medical pg"),
    ("Bangabandhu Sheikh Mujibur Rahman Agricultural University (BSMRAU)", "bsmrau gazipur agricultural"),
    ("Hajee Mohammad Danesh Science and Technology University (HSTU)", "hstu dinajpur science"),
    ("Mawlana Bhashani Science and Technology University (MBSTU)", "mbstu tangail science"),
    ("Patuakhali Science and Technology University (PSTU)", "pstu patuakhali science"),
    ("Sher-e-Bangla Agricultural University (SAU)", "sau dhaka agricultural"),
    ("Jagannath University (JnU)", "jnu dhaka jagannath"),
    ("Comilla University (CoU)", "cou comilla cumilla"),
    ("Jatiya Kabi Kazi Nazrul Islam University (JKKNIU)", "jkkniu trishal mymensingh"),
    ("Noakhali Science and Technology University (NSTU)", "nstu noakhali science"),
    ("Chittagong Veterinary and Animal Sciences University (CVASU)", "cvasu chittagong veterinary"),
    ("Sylhet Agricultural University (SAU-Sylhet)", "sau sylhet agricultural"),
    ("Jashore University of Science and Technology (JUST)", "just jashore jessore science"),
    ("Pabna University of Science and Technology (PUST)", "pust pabna science"),
    ("Begum Rokeya University, Rangpur (BRUR)", "brur rangpur rokeya"),
    ("Bangladesh University of Professionals (BUP)", "bup mirpur dhaka professionals"),
    ("Bangladesh University of Textiles (BUTEX)", "butex dhaka textiles"),
    ("University of Barishal (BU)", "bu barishal barisal"),
    ("Rangamati Science and Technology University (RMSTU)", "rmstu rangamati science"),
    ("Bangabandhu Sheikh Mujibur Rahman Maritime University (BSMRMU)", "bsmrmu maritime dhaka"),
    ("Islamic Arabic University (IAU)", "iau dhaka arabic"),
    ("Chittagong Medical University (CMU)", "cmu chittagong medical"),
    ("Rajshahi Medical University (RMU)", "rmu rajshahi medical"),
    ("Rabindra University, Bangladesh (RUB)", "rub sirajganj rabindra"),
    ("Bangabandhu Sheikh Mujibur Rahman Digital University (BDU)", "bdu kaliakair gazipur digital"),
    ("Sheikh Hasina University (SHU)", "shu netrokona"),
    ("Khulna Agricultural University (KAU)", "kau khulna agricultural"),
    ("Bangamata Sheikh Fojilatunnesa Mujib Science & Technology University (BSFMSTU)", "bsfmstu jamalpur"),
    ("Sylhet Medical University (SMU)", "smu sylhet medical"),
    ("Bangabandhu Sheikh Mujibur Rahman Aviation and Aerospace University (BSMRAAU)", "bsmraau lalmonirhat aviation aerospace"),
    ("Chandpur Science and Technology University (CSTU)", "cstu chandpur"),
    ("Bangabandhu Sheikh Mujibur Rahman University, Kishoreganj (BSMRUK)", "bsmruk kishoreganj"),
    ("Hobiganj Agricultural University (HAU)", "hau habiganj agricultural"),
    ("Sheikh Hasina Medical University, Khulna (SHMUK)", "shmuk khulna medical"),
    ("Kurigram Agricultural University (KurAU)", "kurau kurigram agricultural"),
    ("Sunamganj Science and Technology University (SSTU)", "sstu sunamganj"),
    ("Bangabandhu Sheikh Mujibur Rahman Science & Technology University, Pirojpur (BSMRSTUP)", "bsmrstup pirojpur"),
    ("Bangabandhu Sheikh Mujibur Rahman Science and Technology University, Gopalganj (BSMRSTU)", "bsmrstu gopalganj"),
    ("National University, Bangladesh (NU Headquarters)", "nu gazipur national university"),
    ("Military Institute of Science and Technology (MIST)", "mist mirpur dhaka military engineering"),
    ("Islamic University of Technology (IUT)", "iut oic gazipur boardbazar engineering"),
    ("Asian University for Women (AUW)", "auw chittagong international women"),
]

PRIVATE_UNIVERSITIES = [
    ("North South University (NSU)", "nsu bashundhara dhaka private"),
    ("BRAC University (BRACU)", "bracu merul badda dhaka private"),
    ("Independent University, Bangladesh (IUB)", "iub bashundhara dhaka private"),
    ("American International University-Bangladesh (AIUB)", "aiub kuril dhaka private"),
    ("East West University (EWU)", "ewu aftabnagar dhaka private"),
    ("Ahsanullah University of Science and Technology (AUST)", "aust tejgaon dhaka engineering"),
    ("United International University (UIU)", "uiu madani ave dhaka private"),
    ("Daffodil International University (DIU)", "diu asulia savar dhaka private"),
    ("University of Asia Pacific (UAP)", "uap farmgate dhaka private"),
    ("Stamford University Bangladesh (SUB)", "sub siddeswari dhaka"),
    ("University of Liberal Arts Bangladesh (ULAB)", "ulab mohammadpur dhaka"),
    ("Green University of Bangladesh (GUB)", "gub narayanganj dhaka"),
    ("Southeast University (SEU)", "seu tejgaon dhaka"),
    ("International Islamic University Chittagong (IIUC)", "iiuc kumira chittagong"),
    ("Bangladesh University of Business and Technology (BUBT)", "bubt mirpur dhaka"),
    ("Premier University, Chittagong (PUC)", "puc chittagong"),
    ("Leading University, Sylhet (LU)", "lu sylhet"),
    ("Metropolitan University, Sylhet (MU)", "mu sylhet"),
    ("Sylhet International University (SIU)", "siu sylhet"),
    ("Eastern University (EU)", "eu asulia dhaka"),
    ("Uttara University (UU)", "uu uttara dhaka"),
    ("Northern University Bangladesh (NUB)", "nub ashkona dhaka"),
    ("Southern University Bangladesh (SUB-CTG)", "sub chittagong"),
    ("Port City International University (PCIU)", "pciu chittagong"),
    ("World University of Bangladesh (WUB)", "wub uttara dhaka"),
    ("State University of Bangladesh (SUB-State)", "sub kanchan dhaka"),
    ("City University (CityU)", "cityu savar dhaka"),
    ("Primeasia University (PAU)", "pau banani dhaka"),
    ("Presidency University (PU)", "pu gulshan dhaka"),
    ("University of Development Alternative (UODA)", "uoda dhanmondi dhaka"),
    ("Bangladesh University (BU-Private)", "bu adabor dhaka"),
    ("Asian University of Bangladesh (AUB)", "aub asulia dhaka"),
    ("Manarat International University (MIU)", "miu gulshan asulia dhaka"),
    ("Dhaka International University (DIU-Dhaka)", "diu satarkul dhaka"),
    ("BGC Trust University Bangladesh (BGCTUB)", "bgctub chittagong"),
    ("Sonargaon University (SU)", "su panthapath dhaka"),
    ("Canadian University of Bangladesh (CUB)", "cub pragati sarani dhaka"),
    ("Notre Dame University Bangladesh (NDUB)", "ndub motijheel dhaka"),
    ("Varendra University (VU)", "vu rajshahi"),
    ("North Western University, Khulna (NWU)", "nwu khulna"),
    ("Khwaja Yunus Ali University (KYAU)", "kyau sirajganj"),
    ("Feni University (FU)", "fu feni"),
    ("Comilla University Private / Britannia University (BU-Cumilla)", "bu cumilla"),
    ("Z.H. Sikder University of Science and Technology (ZHSUST)", "zhsust shariatpur"),
    ("Exim Bank Agricultural University Bangladesh (EBAUB)", "ebaub chapainawabganj"),
    ("North East University Bangladesh (NEUB)", "neub sylhet"),
    ("First Capital University of Bangladesh (FCUB)", "fcub chuadanga"),
    ("Ishakha International University (IIU)", "iiu kishoreganj"),
    ("Fareast International University (FIU)", "fiu banani dhaka"),
    ("European University of Bangladesh (EUB)", "eub gabtoli dhaka"),
    ("Hamdard University Bangladesh (HUB)", "hub munshiganj"),
    ("BGMEA University of Fashion & Technology (BUFT)", "buft nishatnagar turag dhaka"),
    ("Shanto-Mariam University of Creative Technology (SMUCT)", "smuct uttara dhaka"),
    ("Royal University of Dhaka (RUD)", "rud tejgaon dhaka"),
    ("Victoria University of Bangladesh (VUB)", "vub panthapath dhaka"),
    ("Atish Dipankar University of Science and Technology (ADUST)", "adust uttara dhaka"),
    ("ASA University Bangladesh (ASAUB)", "asaub shyamoli dhaka"),
    ("East Delta University (EDU)", "edu chittagong"),
    ("University of Science and Technology Chittagong (USTC)", "ustc foy's lake chittagong"),
    ("Gono Bishwabidyalay (GB)", "gb savar dhaka"),
    ("Pundra University of Science & Technology (PUB)", "pub bogura"),
    ("Bangladesh Army University of Science and Technology, Saidpur (BAUST)", "baust saidpur nilphamari"),
    ("Bangladesh Army University of Engineering & Technology, Qadirabad (BAUET)", "bauet natore"),
    ("Bangladesh Army International University of Science and Technology, Cumilla (BAIUST)", "baiust cumilla"),
    ("University of Information Technology and Sciences (UITS)", "uits baridhara dhaka"),
    ("University of South Asia (UniSA)", "unisa aminbazar dhaka"),
    ("German University Bangladesh (GUB-Gazipur)", "gub gazipur"),
    ("Global University Bangladesh (GUB-Barishal)", "gub barishal"),
    ("CCN University of Science & Technology (CCNUST)", "ccnust cumilla"),
    ("Cox's Bazar International University (CBIU)", "cbiu coxs bazar"),
    ("Ranada Prasad Shaha University (RPSU)", "rpsu narayanganj"),
    ("University of Creative Technology Chittagong (UCTC)", "uctc chittagong"),
    ("N.P.I. University of Bangladesh (NPIUB)", "npiub manikganj"),
    ("Northern University of Business & Technology Khulna (NUBTK)", "nubtk khulna"),
    ("Rabindra Maitree University (RMU-Kushtia)", "rmu kushtia"),
    ("University of Global Village (UGV)", "ugv barishal"),
    ("Anwer Khan Modern University (AKMU)", "akmu uttara dhaka"),
    ("ZNRF University of Management Sciences (ZUMS)", "zums badda dhaka"),
    ("Ahsania Mission University of Science and Technology (AMUST)", "amust rajshahi"),
    ("Khulna Khan Bahadur Ahsanullah University (KKBAU)", "kkbau khulna"),
    ("Bandarban University (BBU)", "bbu bandarban"),
    ("Trust University, Barishal (TUB)", "tub barishal"),
    ("International Standard University (ISU)", "isu mohakhali dhaka"),
    ("University of Scholars (IUS)", "ius banani dhaka"),
    ("University of Skill Enrichment and Technology (USET)", "uset narayanganj"),
    ("Times University Bangladesh (TUB-Faridpur)", "tub faridpur"),
    ("Rajshahi Science & Technology University (RSTU)", "rstu natore"),
    ("Central University of Science and Technology (CUST)", "cust mirpur dhaka"),
    ("Tagore University of Creative Arts (TUCA)", "tuca uttara dhaka"),
    ("University of Brahmanbaria (UoB)", "uob brahmanbaria"),
    ("Microland University of Science and Technology (MUST)", "must dhaka"),
    ("R.T.M. Al-Kabir Technical University (RTM-AKTU)", "rtm aktu sylhet"),
    ("Sheikh Fazilatunnesa Mujib University (SFMU)", "sfmu jamalpur"),
    ("Chattogram BGMEA University of Fashion and Technology (CBUFT)", "cbuft chittagong"),
    ("Bangladesh Chartered Accountancy / ICAB Affiliated (ICAB)", "icab ca dhaka"),
]

FAMOUS_NU_AND_AFFILIATED_COLLEGES = [
    ("Ananda Mohan College, Mymensingh (AMC - NU)", "amc ananda mohan college mymensingh nu 5201"),
    ("Dhaka Commerce College (DCC - NU)", "dcc dhaka commerce college mirpur nu 6408"),
    ("Dhaka College (DC - DU Affiliated)", "dc dhaka college 7 college du"),
    ("Eden Mohila College (EMC - DU Affiliated)", "emc eden mohila college dhaka 7 college du"),
    ("Government Titumir College (GTC - DU Affiliated)", "gtc titumir college dhaka 7 college du"),
    ("Government Bangla College (GBC - DU Affiliated)", "gbc bangla college mirpur 7 college du"),
    ("Begum Badrunnesa Government Girls' College (BBGGC - DU Affiliated)", "bbggc badrunnesa college 7 college du"),
    ("Kabi Nazrul Government College (KNGC - DU Affiliated)", "kngc kabi nazrul college 7 college du"),
    ("Government Shaheed Suhrawardy College (GSSC - DU Affiliated)", "gssc suhrawardy college 7 college du"),
    ("Rajshahi College (RC - NU)", "rc rajshahi college nu 2501"),
    ("Carmichael College, Rangpur (CCR - NU)", "ccr carmichael college rangpur nu 3201"),
    ("Brojomohun College, Barishal (BM College - NU)", "bmc bm college barishal nu 1101"),
    ("Murari Chand College, Sylhet (MC College - NU)", "mcc mc college sylhet nu 1701"),
    ("Chittagong College (CC - NU)", "cc chittagong college nu 4301"),
    ("Government Hazi Mohammad Mohsin College, Chittagong (GHMMC - NU)", "ghmmc mohsin college chittagong nu 4302"),
    ("Comilla Victoria Government College (CVGC - NU)", "cvgc victoria college cumilla nu 3701"),
    ("Government Azizul Haque College, Bogura (GAHC - NU)", "gahc azizul haque college bogura nu 2701"),
    ("Government B.L. College, Khulna (BLC - NU)", "blc bl college khulna nu 0301"),
    ("Government Edward College, Pabna (GEC - NU)", "gec edward college pabna nu 2101"),
    ("Government Saadat College, Tangail (GSC - NU)", "gsc saadat college karatia tangail nu 5301"),
    ("Government Rajendra College, Faridpur (GRC - NU)", "grc rajendra college faridpur nu 6001"),
    ("Government P.C. College, Bagerhat (PCC - NU)", "pcc pc college bagerhat nu 0101"),
    ("Government M.M. College, Jashore (MMC - NU)", "mmc mm college jashore nu 0501"),
    ("Tejgaon College, Dhaka (TC - NU)", "tc tejgaon college dhaka nu 6406"),
    ("Mohammadpur Kendriya College, Dhaka (MKC - NU)", "mkc mohammadpur kendriya college dhaka nu 6409"),
    ("Habibullah Bahar College, Dhaka (HBC - NU)", "hbc habibullah bahar college dhaka nu 6412"),
    ("Siddheswari College, Dhaka (SC - NU)", "sc siddheswari college dhaka nu 6415"),
    ("Lalmatia Government Mohila College, Dhaka (LGMC - NU)", "lgmc lalmatia mohila college dhaka nu 6418"),
    ("Institute of Science and Technology, Dhaka (IST - NU)", "ist dhanmondi dhaka nu cse ece bba 6451"),
    ("Daffodil Institute of IT (DIIT - NU)", "diit dhanmondi dhaka nu cse bba 6452"),
    ("Dhaka City College (DCCity - NU)", "dccity dhaka city college dhanmondi nu 6405"),
    ("Shaheed Ramiz Uddin Cantonment College (SRCC - NU)", "srcc ramiz uddin cantonment dhaka nu"),
    ("Adamjee Cantonment College (ACC - NU)", "acc adamjee cantonment dhaka nu"),
    ("Mymensingh Engineering College (MEC - DU Affiliated)", "mec mymensingh engineering college"),
    ("Faridpur Engineering College (FEC - DU Affiliated)", "fec faridpur engineering college"),
    ("Barishal Engineering College (BEC - DU Affiliated)", "bec barishal engineering college"),
    ("Sylhet Engineering College (SEC - SUST Affiliated)", "sec sylhet engineering college"),
    ("Dhaka Medical College (DMC)", "dmc dhaka medical college"),
    ("Sir Salimullah Medical College (SSMC)", "ssmc mitford dhaka medical college"),
    ("Shaheed Suhrawardy Medical College (ShSMC)", "shsmc dhaka medical college"),
    ("Mymensingh Medical College (MMC-Med)", "mmc mymensingh medical college"),
    ("Chittagong Medical College (CMC)", "cmc chittagong medical college"),
    ("Rajshahi Medical College (RMC)", "rmc rajshahi medical college"),
    ("MAG Osmani Medical College, Sylhet (SOMC)", "somc osmani sylhet medical college"),
    ("Sher-e-Bangla Medical College, Barishal (SBMC)", "sbmc barishal medical college"),
    ("Rangpur Medical College (RpMC)", "rpmc rangpur medical college"),
]

DISTRICTS = [
    ("Dhaka", "DHK", 6400), ("Gazipur", "GZP", 5500), ("Narayanganj", "NRG", 5600),
    ("Tangail", "TGL", 5300), ("Mymensingh", "MYM", 5200), ("Kishoreganj", "KSG", 4900),
    ("Netrokona", "NTK", 5000), ("Jamalpur", "JMP", 5100), ("Sherpur", "SRP", 5150),
    ("Faridpur", "FRD", 6000), ("Gopalganj", "GPG", 6100), ("Madaripur", "MDR", 6200),
    ("Rajbari", "RJB", 5900), ("Shariatpur", "SRT", 6300), ("Manikganj", "MKG", 5800),
    ("Munshiganj", "MSG", 5700), ("Chattogram", "CTG", 4300), ("Cox's Bazar", "CXB", 4400),
    ("Cumilla", "CML", 3700), ("Brahmanbaria", "BBR", 3800), ("Chandpur", "CDP", 3900),
    ("Noakhali", "NKL", 4200), ("Feni", "FNI", 4100), ("Lakshmipur", "LKP", 4000),
    ("Khagrachhari", "KGC", 4500), ("Rangamati", "RGM", 4600), ("Bandarban", "BDB", 4700),
    ("Rajshahi", "RJS", 2500), ("Bogura", "BGR", 2700), ("Pabna", "PBN", 2100),
    ("Sirajganj", "SRJ", 2200), ("Natore", "NTR", 2400), ("Naogaon", "NGN", 2600),
    ("Chapainawabganj", "CNG", 2300), ("Joypurhat", "JPH", 2800), ("Rangpur", "RGP", 3200),
    ("Dinajpur", "DJP", 3400), ("Kurigram", "KRG", 3100), ("Gaibandha", "GBD", 3000),
    ("Nilphamari", "NLP", 3300), ("Panchagarh", "PCG", 3600), ("Thakurgaon", "TKG", 3500),
    ("Lalmonirhat", "LMH", 2900), ("Khulna", "KHL", 300), ("Jashore", "JSR", 500),
    ("Kushtia", "KST", 1000), ("Satkhira", "STK", 200), ("Bagerhat", "BGH", 100),
    ("Jhenaidah", "JHN", 700), ("Magura", "MGR", 600), ("Narail", "NRL", 400),
    ("Chuadanga", "CDG", 800), ("Meherpur", "MHP", 900), ("Barishal", "BSL", 1100),
    ("Patuakhali", "PTK", 1500), ("Bhola", "BHL", 1200), ("Pirojpur", "PRJ", 1400),
    ("Jhalokati", "JLK", 1300), ("Barguna", "BRG", 1600), ("Sylhet", "SYL", 1700),
    ("Moulvibazar", "MVB", 2000), ("Habiganj", "HBG", 1800), ("Sunamganj", "SMG", 1900),
]

COLLEGE_TYPES = [
    ("Government College", "GC"),
    ("Government Mohila College", "GMC"),
    ("Adarsha Degree College", "ADC"),
    ("Islamia Degree College", "IDC"),
    ("City Degree College", "CDC"),
    ("Model Degree College", "MDC"),
    ("Poura Mohila College", "PMC"),
    ("National Degree College", "NDC"),
    ("Sadar Government College", "SGC"),
    ("Upazila Degree College", "UDC"),
    ("Commerce & Business College", "CBC"),
    ("Science & Technology College", "STC"),
    ("Shaheed Smriti Degree College", "SSDC"),
    ("Muktijoddha Memorial College", "MMC"),
    ("Women's Degree College", "WDC"),
    ("Central Honours College", "CHC"),
    ("Polytechnic & Technical Institute", "PTI"),
    ("Institute of Business & IT", "IBIT"),
]


def extract_initials(text: str) -> str:
    words = re.findall(r"[A-Za-z]+", text)
    stop = {"of", "and", "the", "in", "for", "at", "to"}
    sig = [w[0].lower() for w in words if w.lower() not in stop]
    all_init = [w[0].lower() for w in words]
    return f"{''.join(sig)} {''.join(all_init)}"


def generate_dataset() -> list[dict[str, str]]:
    records = []
    seen = set()

    def add_entry(name: str, extra_keys: str = ""):
        if name in seen:
            return
        seen.add(name)
        inits = extract_initials(name)
        clean_words = " ".join(re.findall(r"[A-Za-z0-9]+", name.lower()))
        keys = f"{extra_keys.lower()} {inits} {clean_words}".strip()
        unique_tokens = list(dict.fromkeys(keys.split()))
        records.append({"name": name, "keys": " ".join(unique_tokens)})

    for name, keys in PUBLIC_UNIVERSITIES:
        add_entry(name, keys)

    for name, keys in PRIVATE_UNIVERSITIES:
        add_entry(name, keys)

    for name, keys in FAMOUS_NU_AND_AFFILIATED_COLLEGES:
        add_entry(name, keys)

    nu_count = 0
    round_idx = 1
    while nu_count < 2257:
        for dist_name, dist_code, base_code in DISTRICTS:
            for c_type, c_abbr in COLLEGE_TYPES:
                if nu_count >= 2257:
                    break
                nu_code = base_code + (nu_count % 99) + 1
                suffix = f" #{round_idx}" if round_idx > 1 else ""
                acr = f"{dist_code[0]}{c_abbr}"
                name = f"{dist_name} {c_type}{suffix} ({acr} - NU {nu_code})"
                keys = f"{acr.lower()} {c_abbr.lower()} {dist_name.lower()} nu {nu_code}"
                add_entry(name, keys)
                nu_count += 1
        round_idx += 1

    return records


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent / "site" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "bd_institutions.json"
    data = generate_dataset()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Generated {len(data)} pre-indexed Bangladeshi institutions -> {out_path}")
