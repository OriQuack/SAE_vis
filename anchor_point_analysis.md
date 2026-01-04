# Anchor Point Analysis - Feature Samples

Generated: 2026-01-04 23:00

## Tag Options
- `noisy-activation`: Activation examples are noisy/not interpretable
- `pattern-miss`: Explanation missed the linguistic pattern (n-grams, morphology)
- `context-miss`: Explanation missed the semantic context
- `well-explained`: Feature is well explained

---

## Feature 11019 (diverse: grid_0_0)

### Best Explanation (gpt-4o-mini, Quality: 0.4517)
>  code elements related to class and type definitions in a programming context

### Activation Examples
**Quantile 3** (max=158.92, pos=[6, 7, 9, 10, 12])
```
importjava.io.File[class]Supp[ressed][Doc]umen[table][Filter][Transformer][(][val][context][:][Dok][ka][Context][)][:][Pre][Merge][Doc][umen][table][Transformer][{][override][fun][invoke][(][modules][:][List][<][D][Module][>):][List][<][D][Module][>]{[return][modules][.][map][NotNull][(::][filter][Module][)][}][private][fun]filter[Module][(][module][:][D][Module][):][D][Module][?][{][val][packages...
```

**Quantile 3** (max=156.34, pos=[2, 3, 4, 5, 6])
```
[val][new][Mappings][=][mutable][ListOf][<][V][cs][Directory][Mapping][>()][for][(][file][in][module][.][root][Manager][.][content][Roots][)][{][val][v][cs][=][v][cs][Manager][.][find][Version][ing][V][cs][(][file][)][if][(][vcs][!=][null][&&][v][cs][!==][v][cs][Manager][.][getV][cs][For][(][file][))]{[new][Mappings][.][add][(][V][cs][Directory][Mapping][(][file][.][path][,][v][cs][.][name][))][}]...
```

**Quantile 2** (max=143.87, pos=[4, 5, 6, 7, 8])
```
Children.filterIs[Instance][<][D][Class][like][>(),][type][aliases][=][filtered][Children][.][filter][Is][Instance][<][D][Type][Alias][>(),][properties][=]filtered[Children][.][filter][Is][Instance][<][D][Property][>()][)][}][}][private][fun][is][Supp][ressed][(][doc][umen][table][:][Doc][umen][table][):][Boolean][{][if][(][doc][umen][table][!][is][With][Sources][)][return][false][val][source][Fil...
```

**Quantile 2** (max=143.65, pos=[4, 5, 6, 7, 8])
```
(argumentExpressions[.][filter][Is][Instance][<][Kt][Call][Expression][>()][.][map][{][it][.][callee][Expression][?.][text][?:][""][})][//][Reference][Expression][=][variable][we]need[to]search[for][rule][Properties][.][addAll][(][argument][Expressions][.][filter][Is][Instance][<][Kt][Reference][Expression][>()][.][map][{][it][.][text][?:][""][})][}][}][<bos>][Failure][of][co][valently][cross][-]l...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4093 |
| score_embedding | 0.3692 |
| score_fuzz | 0.425 |
| score_detection | 0.4833 |
| explanation_semantic_sim | 0.5265 |

### Position: (0.4345, 0.2337)
### Distances: ngram=2.9144, context=4.1571, noisy=4.6288
### Current: **missed_ngram** (margin: 1.2427)

### Your Tag: _____________

---

## Feature 11661 (diverse: grid_0_1)

### Best Explanation (gemini-flash-2.5, Quality: 0.4558)
> `AVDictionary` `StringLiteral` `order`

### Activation Examples
**Quantile 3** (max=52.76, pos=[13, 14, 15, 16, 17])
```
()wouldnotwork.matchfinder->addMatcher[(][cxx][Constructor][Decl][(][forEach]ConstructorInitializer[(][with]Initializer[(][expr][(][has][(][constructor]call))))),[&]initializercallback);}[void][Constructor]Callback::run[(][const]MatchFinder[::]MatchResult&result){[const][clang][::][StringLiteral]*literal=result[.]Nodes.getNodeAs[<]clang[::]StringLiteral>("literal");if(literal[->]getLength()>0)retu...
```

**Quantile 3** (max=51.97, pos=[12, 13, 14, 15, 16])
```
this->_getState($_state)){$collection=[Mage][::][getResource][Model][('][sales][/][order][status]collection')[->][add][State]Filter($_state[)][->][orderBy]Label();foreach($collectionas[$]status)[{]$code=$[status][->][getStatus]();if($addLabels)[{]$statuses[$code]=$status[->][getStore]Label();}else[{]$statuses[]=$code;}}}}$this[->_][state]Statuses[$key]=$statuses;return$statuses
```

**Quantile 2** (max=48.47, pos=[83, 100, 112, 114, 115])
```
Password=students;Database=retrospeles;";//stringconnectionstring=String.Format("Server={0};Port={1};"+//"UserId={2};Password={3};Database={4};",//serveris.ToString(),port.ToString(),user.ToString(),//password.ToString(),database.ToString());Npgs[ql]Connectionncon=newNpgsqlConnection(connectionstring);Npgs[ql]Commandlistfill=newNpgsqlCommand("selecttablename[from][INFORMATION][SCHEMA][.]tables[WHE...
```

**Quantile 2** (max=48.43, pos=[25, 27, 32, 34, 36])
```
=>"month","name"=>"SomePlanName".$_POST['customer-name'],["]currency["]=>"usd",["]id["]=>$planname));Keepinmindthatthe[']id'needstobeunique.Youcouldusethecustomer'sname,atimestamp,orsomeotherrandommethodtoensurethatthisisalwaysthecase.You[']dthenjustcreate[the]subscriptiononthenewly-[added]customer[:]$customer=[Stripe][Customer][::][retrieve][($][customer]justcreated[);][$][customer][->][subscript...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.296 |
| score_embedding | 0.395 |
| score_fuzz | 0.3833 |
| score_detection | 0.4583 |
| explanation_semantic_sim | 0.3918 |

### Position: (0.4323, 0.289)
### Distances: ngram=2.9992, context=4.3945, noisy=3.6463
### Current: **noisy_activation** (margin: 0.6471)

### Your Tag: _____________

---

## Feature 8873 (diverse: grid_0_2)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5717)
> Code syntax elements, particularly closing brackets, parentheses, and semicolons, often marking the end of a statement, function, or block.

### Activation Examples
**Quantile 3** (max=56.71, pos=[112, 113, 114])
```
<inputtype="checkbox"[ngModelOptions]="{standalone:true}"class="setup-checkbox"[(ngModel)]="item.isCreateChecked"(change)="isCreateChecked(i,'create')"></div><divclass="table-cell"><inputtype="checkbox"[ngModelOptions]="{standalone:true}"class="setup-checkbox"[(ngModel)]="item.isDeleteChecked"(change)="isCreateChecked(i,'delete')[">]</div></div></div>
```

**Quantile 3** (max=51.2, pos=[96, 115, 117, 118])
```
whenitreachesatarget.<bos><?xmlversion="1.0"?><ZopeData><recordid="1"aka="AAAAAAAAAAE="><pickle><globalname="ProxyField"module="Products.ERP5Form.ProxyField"/></pickle><pickle><dictionary><item><key><string>id</string></key><value><string>mytextareafield</string></[value]></item><item>
```

**Quantile 2** (max=41.29, pos=[83, 103, 104, 105, 106])
```
Ifyouwantthisfordoingaggregationorotherwiseneedtheresultsinadayonlyformatthendothisusing$projectandthedateoperators:db.collection.aggregate([//Stillmatchonthenormaldateforms,thistimewholemonth{"$match":{created:{"$gte":newDate("2013-05-01"),"$lt":newDate("2013-05-31")[}]}},//Projectthedate{"$project":{"date":
```

**Quantile 2** (max=40.45, pos=[27, 62, 63])
```
11","button12"]},{"id":"2","accordionBody":"body2","accordionInnerButtonTexts":["button21","button22"[]]}]}WhichmeansthatIalwayswanttoincludetheindex-fieldasindex,andIwanttoincludethewholeaccordions-listIFITEXISTSintheobject.Hereismyattempt:.hits[]|{index:._index,accordions:
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3595 |
| score_embedding | 0.5325 |
| score_fuzz | 0.4583 |
| score_detection | 0.5226 |
| explanation_semantic_sim | 0.2924 |

### Position: (0.4451, 0.3682)
### Distances: ngram=3.7304, context=5.2386, noisy=3.0269
### Current: **noisy_activation** (margin: 0.7035)

### Your Tag: _____________

---

## Feature 6144 (diverse: grid_1_0)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.3333)
> Punctuation marks, special characters, and sometimes words or phrases that are part of a larger code snippet, mathematical expression, or sentence, often serving as a delimiter or separator.

### Activation Examples
**Quantile 3** (max=127.1, pos=[9, 16, 44, 69, 80])
```
._onKeyUp=(e)=>{if(document.active[Element].tagName=="INPUT")return;if(typeofthis.keyBindings[e.code]!=="undefined"){constevent=this.keyBindings[e.code];if(typeofevent==="function"){event();}else{this.keyState[event]=false;if(!this.visualizer.isPlaying()&&Object.values(this.keyState).every((v[)]=>!v)){[}]
```

**Quantile 3** (max=94.68, pos=[39, 41, 66, 69, 70])
```
this.visualizer.camera.zoomBy(0.5,0.5,dt);}elseif(this.keyState["zoomOut"]){[this].visualizer.camera.zoomBy(0.5,0.5,-dt);}}[}]<bos>Q:whyAJAXredirectstothenewpageinPHPIhaveaform:<formclass="searchForm"><divclass="boxstyle1"><h4><?=Yii::t("common","Age");?></h4>
```

**Quantile 2** (max=75.1, pos=[22, 24, 36, 54, 73])
```
return(i==-1)?0:n.length-i-1;}functiongetVF(n,optprecision){varv=optprecision;if(undefined===v){v=Math.min(getDecimals(n),3);}varbase=Math.pow(10,v);varf=((n*base)|0)%base;return{v:v,f:f};}$provide.value("$locale",{
```

**Quantile 2** (max=66.71, pos=[12, 29, 88])
```
[key]:prepare(o[key])}),{});return{...o,...replacedStrings,...preparedChildren};}<bos>Background{#Sec1}==========Bronchopleuralfistula(BPF)isarelativelyinfrequentbutpotentiallyfatalcomplicationofpulmonaryresection.BPFcanbedividedintoperipheralorcentral,basedonthelocationoftheleakage,andBPFoccursinabout1.5to28%ofpneumonectomycases,andisassociatedwithhighdeathrate\[[@CR9],[@CR30]\].Itisestimatedthat...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2902 |
| score_embedding | 0.3642 |
| score_fuzz | 0.2167 |
| score_detection | 0.2 |
| explanation_semantic_sim | 0.5119 |

### Position: (0.4718, 0.2094)
### Distances: ngram=3.3122, context=3.8433, noisy=5.607
### Current: **missed_ngram** (margin: 0.531)

### Your Tag: _____________

---

## Feature 8804 (diverse: grid_1_1)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5533)
> Alphanumeric codes, abbreviations, and identifiers often used in technical, scientific, and product-related contexts.

### Activation Examples
**Quantile 3** (max=73.86, pos=[10, 21, 22, 23, 24])
```
thanothercycles.Thisrequirementissameforall[US]energystarlabeledwashingmachines.*Formodels[WT][5][8][6]0[**/][WT][1][7][0][1]**:Forthisreason,werecommend“PowerCleanse"cycle*Formodels[WT][5]******/[WT][4]***[CW]:Forthisreason,werecommend"PermPress/Casual"cycle.*Formodels[WT][1]******:Forthisreason,werecommend"Purecolor"cycle.(Ifcustomerwanttousecottonorheavyduty,recommendswaterplusorfabricsoftenero...
```

**Quantile 3** (max=72.84, pos=[12, 14, 44, 45, 46])
```
chrouswhilecontrollingthevolumeofthemusictoharmonizeThe[Dual][3]Wspeakerswiththefull-rangeprovideamazingclarityandsoundfrombothMusicthroughBluetooth/AUXandyourVoice.Fittedwithamixeronboardthe[MQ][0][9],youcancontrolTreble,Bass,IndependantVolumecontrolsforVoice&Music,andalsoaddEchotoyourvoice.Bluetooth4.0wirelesstransmissionsolvestheneedtocarryaroundanAUXcord,butwe’veincludedoneforyouincaseyourdevi...
```

**Quantile 2** (max=63.75, pos=[30, 31, 32, 33, 34])
```
596026;Invitrogen;ThermoFisherScientific,Inc.)accordingtothemanufacturer\'sprotocol.PrimeScriptRTreagentkit([DR][R][0][3][7][A];TakaraBio,Inc.,[O]tsu,Japan)wereusedforcDNAgeneration(42°Cfor30--60min,70°Cfor15min).RT-qPCRwasperformedwithSuperRealPreMix(cat[.]no[.][FP][2][0][4][-][0]1;[Ti]angenBiotech,Co.,Ltd.,Beijing,China)bythefollowingprogram:95°Cfor3min
```

**Quantile 2** (max=63.18, pos=[67, 68, 69])
```
-compact,it’seasytotakeanywhere.Useitatafriendshousetosingkaraoke,afamilyreunion,party,orifyou’reastreetperformer,thiswillreplaceyourloudspeaker!Withthebuilt-indualspeakers,yougeta360Âºprojectionofsound.TheIndigi[MQ][0][9]WirelessBluetoothMicrophoneandSpeakerCombocanplayunpluggedupto5hoursandcanbechargedfrommostUSBpowersources.Themicrophoneislayeredwiththreetypesoffilterstoremoveanydistortion/back...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2145 |
| score_embedding | 0.1317 |
| score_fuzz | 0.7833 |
| score_detection | 0.6583 |
| explanation_semantic_sim | 0.5923 |

### Position: (0.5162, 0.2908)
### Distances: ngram=5.2872, context=4.7601, noisy=4.9395
### Current: **missed_context** (margin: 0.1794)

### Your Tag: _____________

---

## Feature 2721 (diverse: grid_1_2)

### Best Explanation (gemini-flash-2.5, Quality: 0.5592)
> cancer treatment duration

### Activation Examples
**Quantile 3** (max=46.95, pos=[2, 14, 30, 31, 32])
```
energy[than]conventionalmodels.Thesenew-gener-ationair[conditioners]oftenhavetimerstoturndownthepowerwhenit’s[Hot][tips][for][not][needed][.][Smart][usage]tipsOnce[you]havethe[keeping][cool][right][air][conditioner][in][place][,]A[HAM][suggests]followingthese[tips][to]optimize[performance][.]•Turnofftheunitandopendoorsandwindowsduringcoolerperiods.•Usetheunitfanandportablefanstodrawincooleroutside...
```

**Quantile 3** (max=44.27, pos=[24, 26, 27, 28, 29])
```
WEBELIEVE...WEBELIEVE...WEBELIEVE…IntheFighttoRemainInOurFuturetoBuildInEachOthertoat[the]Fore[front][We][push][of][ideas][as][Long][far]-term[and][Value][as][for][fast][as][possible][Foster][Teamwork]andTherapies[for]Rareand[Our][Stakeholders][Respect][for][Each][Orphan][Diseases][Individual]’s[Contribution][We]encourageandembraceconstantinnovation[•][We][seek][to][deliver][the][highest][quality]...
```

**Quantile 3** (max=40.82, pos=[20, 22, 23, 24, 25])
```
willneverbeconstrainedbypriorthinkingWewillnotlie,cheatorsteal•Welearnfromour[Our]mistakes[passion][for][making][•]Wetakefullresponsibility[a][difference][for]our[unites][us][•]Wethinkdifferently-verydifferently[actions]Galafold®(migalastat)GlobalLaunch……takingaleadershiproleinthetreatmentofFabrydisease[“]Wepushideasasfarandasfastaspossible”-AmicusBeliefStatementGalafold:PrecisionMedicineforFabryD...
```

**Quantile 2** (max=39.21, pos=[94, 96, 97, 98, 99])
```
No.2--95--0698INTHEAPPELLATECOURTOFILLINOISSECONDDISTRICTTHEPEOPLEOFTHESTATE[)][Appeal][from][the][Circuit][Court]OFILLINOIS,)[of][Stephenson][County][.]
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1963 |
| score_embedding | 0.5125 |
| score_fuzz | 0.3833 |
| score_detection | 0.3667 |
| explanation_semantic_sim | 0.1752 |

### Position: (0.4839, 0.4053)
### Distances: ngram=4.7555, context=5.4912, noisy=3.15
### Current: **missed_ngram** (margin: 1.6055)

### Your Tag: _____________

---

## Feature 1641 (diverse: grid_1_3)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5367)
> Articles, pronouns, and auxiliary verbs, often used to introduce or connect clauses, phrases, or sentences, and sometimes preceding or following a quotation mark.

### Activation Examples
**Quantile 3** (max=60.18, pos=[12, 15, 16, 17, 18])
```
bloodoftheOrionandLeoSystems.AfterDonArmage[is]defeated,[Lucky][resumes][his][travels]throughthe[universe][with]Garu[accompanying][him][.][Despite][his][amazing][luck][,][Lucky][is][subjected][to][constellation][fortune][and][his][prowess][is][badly][affected]when[receiving]badluck[.][His][luck][and][spirit][is][actually][so][much][stronger][than][his][ancestors][.][This][makes][him][immune][from]...
```

**Quantile 3** (max=56.76, pos=[12, 24, 29, 33, 34])
```
machinedesignatedasameantforJarkMatter's[use].Buttheproject'soverseer,Champ'[s]creatorDoctorAnton,[later]revealedtobe[his][good][-][half][after][separating][himself][from][his][evil][-]half,[ran][off]with[Champ][as][he][made][the][robot][good][-][w][illed][,]while[teaching][him][to][value][all]life[in]the[universe][.][He][was][a][professional][wrestler]fornineyears[until][he][became]championtheday...
```

**Quantile 2** (max=52.72, pos=[18, 26, 27, 28, 29])
```
3minutesonhiscareerandhistimeontheshow,recallingthechangesmadetothe[character]betweentheTVfilmsandtheseries[to][make][it][more][child][-][friendly],[especially]since[there]was[an]emphasis[on]making[Steve][Austin][more][of][an][approachable][,][human][character][and][on][not][having][him][constantly][killing][the][bad][dies][at][the][end][of][every][story].HementionsworkingwithLindsay[Wagner]andRic...
```

**Quantile 2** (max=52.34, pos=[3, 4, 5, 6, 7])
```
resultedinLucky[becoming][his][home][world]['][s][king][after][it][is]revealedthat[his][father]Aslan[was][supposed][to][be]murderedbyJarkMatter'sFukuShogunKukulgayearsago[.][He][eventually][finds][out][,]along[with]Tsur[ugi][,]thatAs[lan][is][actually][alive][,][but][was][turned][into][one]ofDonArmage'sbrain[washed]thr[alls][.][Thanks][to][his][fellow]Kyur[angers][,][Lucky][agrees][with][their][ad...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2695 |
| score_embedding | 0.4225 |
| score_fuzz | 0.5488 |
| score_detection | 0.5167 |
| explanation_semantic_sim | 0.2286 |

### Position: (0.4856, 0.4576)
### Distances: ngram=4.3678, context=4.9513, noisy=2.0718
### Current: **noisy_activation** (margin: 2.296)

### Your Tag: _____________

---

## Feature 1799 (diverse: grid_2_0)

### Best Explanation (gemini-flash-2.5, Quality: 0.31)
> numbers and their positions

### Activation Examples
**Quantile 3** (max=80.14, pos=[16, 17, 23, 24, 30])
```
12$$448$$A1\times[A]1$$2[^{][4]5},3^{[4]4},4^{[1]4},5[^{]6},6^{1},7[^{]2},8[^{]1},$$50$$29$$112$$448$$[A]1\times[A]1$$2^{45},3^{44},4[^{]14},5^{6},[6][^{][1]},7^{2
```

**Quantile 3** (max=78.9, pos=[15, 26, 39, 40, 41])
```
},8^{1},$$51$$[3]0$$238$$[4]76$$A1$$2[^{][4][9]},3[^{][4]4},4^{[1]7},[5][^{][6]},[6][^{][1]},7[^{][1]},[8][^{][2]},$$[5][2]$$31$$21$$[5][0]4$$G2\times[A]1$$2^{[5]4},3^{42},[4][^{]21
```

**Quantile 2** (max=74.59, pos=[22, 40, 50, 65, 66])
```
:0xcc,from:0xf6451,to:0xf78[9]2},476:{region:0x5a5[a],code:0x810[7],from:0x0,to:0x0[},][4]77:{region:0x5a5a,code:0x[8]108,from:0x0,to:0x0[},]478:{region:0x5a5a,code:
```

**Quantile 2** (max=74.25, pos=[32, 57, 58, 80, 81])
```
0c,from:0x0,to:0x0},482:{region:0x5a5[a],code:0x810e,from:0x0,to:0x0[},]483:{region:0x5a5a,code:0x[8][1]10,from:0xf[1]421,to:0xfa6[8]1},484:{region:0x5a5a,code:0x[8]
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3368 |
| score_embedding | 0.0817 |
| score_fuzz | 0.3583 |
| score_detection | 0.2917 |
| explanation_semantic_sim | 0.4514 |

### Position: (0.5439, 0.217)
### Distances: ngram=3.6836, context=2.9159, noisy=4.8695
### Current: **missed_context** (margin: 0.7677)

### Your Tag: _____________

---

## Feature 8587 (diverse: grid_2_1)

### Best Explanation (gemini-flash-2.5, Quality: 0.4333)
> movement and transitions

### Activation Examples
**Quantile 3** (max=122.75, pos=[9, 10, 11, 12, 13])
```
makingsurethatweknewourwaythroughthe[northern][half][which][has][a][few][sections][that][go][around][short][breaks][in][the][paved][trail][such][as][north][of][State][Street][in]South[Elgin][and][heading][south]intoSouth[Elgin][where][the][trail][meets]Raymond[Street][,][there][is][also][a][junction][to][the]Elgin[spur][of]thePrairie[Path][.][If][you][cross][Raymond][Street][,][you]’[ll][be][on][t...
```

**Quantile 3** (max=86.15, pos=[3, 4, 5, 6, 7])
```
Trailgivenit[passes][through][the][forest][preserve][and][et][ches][the][road][with][the][same][name][.][Anyways][,][the][far][east][part]of[this][path][stems][off][of][the]OldBridge[Trail][which][is][a][great][place][to][bike][.][When][you][come][off][that][trail][and][onto][the]Kinstone[,][you][go][through][a][small][forested][area][before][heading][up][a][hill][that][starts][you][along]Hononega...
```

**Quantile 3** (max=76.02, pos=[6, 7, 8, 9, 10])
```
wouldstartattheintermodal[station][,][go][north][on]4[th][to]Wisconsin[Avenue][,][then][east][along][Wisconsin][Avenue][to]Jackson[/]Van[Buren][,][then][north][to]Ogden[,][then][east][to]Farwell[.][Why][not][run][this][thing][on][Wisconsin][Avenue][,][which]isdowntown’s[main]street[?]Ithinkoption1[with][the][extension]wouldbegreat,andIwouldactually[trade][the]extension[for][the][small][segment][th...
```

**Quantile 2** (max=71.1, pos=[6, 9, 10, 11, 12])
```
veeverseenonanytrail[.]Highlyrecommend[parking][at][the][trail][head][for][the][Hebron][Trail][off]Keystone[Road][at][the][north][end][of][the][trail][.][Hebron][Trail][will][then][take][you][straight][east][to][hook][up][with]Prairie[Trail][where][you][can][begin][and][head][south][.][No][problems][,][well][maintained][all][the][way][.][Passes][through][several][small][,]medium[sized][towns][on][...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2727 |
| score_embedding | 0.1017 |
| score_fuzz | 0.6417 |
| score_detection | 0.5333 |
| explanation_semantic_sim | 0.4209 |

### Position: (0.528, 0.3124)
### Distances: ngram=4.4777, context=3.7591, noisy=3.6187
### Current: **noisy_activation** (margin: 0.1404)

### Your Tag: _____________

---

## Feature 9558 (diverse: grid_2_2)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5692)
> Verbs and verb phrases, often in the form of linking verbs or auxiliary verbs, that connect the subject of a sentence to additional information.

### Activation Examples
**Quantile 3** (max=91.56, pos=[30, 31, 32, 54, 59])
```
wantmyself.I'dliketodefineanewenvironmentwherereturncalls\newline,andwhereanemptylinecalls\par(this[one][is][already]presentinnormaltextmode)sothatIcandifferentiatebetweenthem.Inaddition,everyspaceinsertedshould[be]printed,butthat[is][taken][care]ofby\obeyspaces.MWE:\documentclass{article}\newenvironment{code}{\ttfamily\parindent=0pt\parskip=5pt\obeyspaces\obeylines}{}\begin{document}\begin{code}
```

**Quantile 3** (max=82.19, pos=[11, 57, 62, 74])
```
frommemory,asIamnotnearmymanuals),[not]forvariablesandparametersinaprocedureorfunction.Butmoreimportantly,youcan'tusetheparametermethodasthenameofatablecolumn-forthatyouneedtoconstructtheSELECTasastringandexecute.This[is]called'dynamicSQL[',]asfarasIrecall;Ithinkyoucando[this]inMySQL,butIamnotsurewithoutlookingitup.Ihopethishelps,andhopefullysomebodywithmoreimmediateknowledgecanhelpyoubetter.<bos>...
```

**Quantile 2** (max=75.63, pos=[58])
```
IputmyPOCOobjectsinanotherassembly?OrshouldItakeathirdapproach?Thankyou.A:NoticethiscommentfromtheADO.NETteamblog:Jeff25Feb20109:10AM@DerekThis[is]intentional.YoucanputyourPOCOclassesinwhatevernamespaceyou'dlike.TheEntityFramework'sbyconventionmechanismfordetectingwhichpropertiesontheentitymatchthepropertiesofentitiesinyourmodeldoesnotuseNamespace.Whatmattersisthatthetypename(without
```

**Quantile 2** (max=75.18, pos=[2, 4, 6, 7, 8])
```
Kindleemail[thing].[It]’[s][really][a]caseofwhat’[s]bestforanygivensituation,butalwayslookingforePubfirst.SowhileIalmostexclusivelyreadebooksontheiPadMininow(withoccasionalforaysonmyphone),Idoitwithavarietyofappsandstores.Idon’tthinkI’llevergobacktoadedicatedereader.AndIreadabout50/50ebook/print,soI’llcertainlyneverabandonpaperbooks.I’manutterbibliophileandlovemybookshelves.Ilovetogetbeautifuledit...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.375 |
| score_embedding | 0.0975 |
| score_fuzz | 0.8417 |
| score_detection | 0.6417 |
| explanation_semantic_sim | 0.3687 |

### Position: (0.5279, 0.3581)
### Distances: ngram=5.6202, context=4.6361, noisy=3.5948
### Current: **noisy_activation** (margin: 1.0413)

### Your Tag: _____________

---

## Feature 5374 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.38)
> strategic plans and long-term goals

### Activation Examples
**Quantile 3** (max=78.9, pos=[11, 12, 15, 16, 17])
```
Federalinvestments….BySeptember30,2[0][1]3,[formulate][a][1][0][-][year][prioriti][zation][of][scientific][facilities]acrosstheOfficeof[Science][based][on](1[)][the]abilityof[the][facility]tocontribute[to]world[-]leadingscience,[(]2)[the]readinessofthefacility[for]construction,[and]([3])[an]estimatedconstructionandoperationscostofthe[facility][.”]ManyOfficeof[Science][facilities]host[one]ofakind,u...
```

**Quantile 3** (max=67.96, pos=[16, 23, 24, 25, 26])
```
companyatalltimesanditisclearlytherighttimeformetostepdown[and]wishthecompanywellinthe[implementation][of][its][Future][Strategic][Direction][Plan],"hesaid.DavidJonessharesgainedfourcentsto$3.33whileMyersharesdroppedonecentto$2.65.<bos><?xmlversion="1.[0]"encoding="UTF-8"?><Workspaceversion="1.0"><FileReflocation="group:Runner.xcodeproj"></FileRef></Workspace><bos>/**linux/include/asm
```

**Quantile 2** (max=62.08, pos=[37, 39, 40, 118, 119])
```
multi-culturalmarkets,topickjustoneofthepopulationsegmentswiththebiggestopportunityandbuildasmuchculturallearningandcompetencyaspossiblebeforeroll-outtootherpopulationsaspartof[an]organic[growth][strategy].IdalizChaconsaiditwasimportanttounderstandthe“sizeoftheprize”tobuildproductcategoryandright-sizetheinvestment.Toclosesharegapsfaster,sheindicatedthatcompaniesshould“investtowin,”evendisproportio...
```

**Quantile 2** (max=61.92, pos=[9, 34, 37, 38, 51])
```
Laboratories”andthat“thethreepillarsof[the]USresearchenterpriseareitsresearchuniversities,itsNationalLaboratories,andindustry'ssubstantialcommitmenttobasicandappliedresearch.”[The]DOE’[s][national]laboratoriesareintegraltoR&Dinnovationandeconomicsuccess.[The][Office]of[Science]manages10ofthe17DOElaboratoriesin[this]country,utilizedeachyearbymorethan25,000non-DOEscientistsnationwide.In2[0][1]2,[upd...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1888 |
| score_embedding | 0.0858 |
| score_fuzz | 0.4583 |
| score_detection | 0.425 |
| explanation_semantic_sim | 0.3585 |

### Position: (0.5173, 0.2971)
### Distances: ngram=4.0797, context=3.6953, noisy=3.6944
### Current: **noisy_activation** (margin: 0.0008)

### Your Tag: _____________

---

## Feature 4683 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5917)
> Special characters, mathematical operators, and symbols used in various contexts, including scientific notation, mathematical expressions, and programming code.

### Activation Examples
**Quantile 3** (max=66.4, pos=[7, 19, 20, 21, 24])
```
wentpublicinareversetakeoverof[a]publiclylistedshell,allowingittoraisearelativelymeager[$][1][0]millionin1997.InFebruary,however,SXCHealth(TSX:SXC)reporteditsfiscal2011resultsandthenumberssurprisedevenitsmostardentsupporters.SXC’srevenuegrewa[whopping][1][5]5%[to][$][5]billion,from[$]1.9billionin2010.Earningswereuptoo,increasing[4]5%[to][$][1][6][6].4million.ThisstoryisbroughttoyoubySerenic(TS
```

**Quantile 3** (max=64.88, pos=[45, 46, 47, 48, 114])
```
Railroad'sinterrelatedfinancialandmaintenancewoes,sinceundertherentaltermstheTerminalCompanyultimatelyrecoupscapitalexpendituresfromtheRailroad,seeinfra.[3]TheonlypropertyownedbytheRailroad,therailsover[1][.][8]milesofCitystreets,islikelytohaveanegativesalvagevalueinlightoftheCity'sdemandthattheRailroadnotmerelypaveoverthetracksbutremovethemandrepavethestreets.Thesalvagevalueoftheleasedequipmentto...
```

**Quantile 2** (max=60.05, pos=[85, 86, 87, 88, 125])
```
'sequipment,handleddistressedfreightintheimmediatevicinityoftheCityofNewYork.[2]TheequipmentusedintheRailroad'soperationisownedbytheTerminalCompany.Undertheleasingarrangement,theRailroadisresponsibleonlyformaintenanceexpenses;capitalexpenditureswithrespecttotheleasedpropertiesaretheobligationoftheTerminalCompany.ThecostofrehabilitatingallthetrackageusedbytheRailroadwasestimatedat[$][5][5][3],000.A...
```

**Quantile 2** (max=59.88, pos=[73, 74, 75, 76, 77])
```
asemployees.Rather,plaintiffconsideredthedrivers,includingHalfhill,tobeindependentcontractorsforfederaltaxpurposesand,therefore,plaintiffdidnotpayemploymenttaxesonthedrivers'compensation.Eventually,inlightoftaxassessmentsleviedbytheInternalRevenueService,plaintiffpaidemploymenttaxesforhisdriversforthesecondhalfof1990intheamount[of][$][4][9][.][2][4].Afterpayingthisamount,plaintifffiledanadministra...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1695 |
| score_embedding | 0.3192 |
| score_fuzz | 0.65 |
| score_detection | 0.5167 |
| explanation_semantic_sim | 0.5242 |

### Position: (0.5086, 0.2941)
### Distances: ngram=4.4517, context=4.2209, noisy=4.2211
### Current: **missed_context** (margin: 0.0002)

### Your Tag: _____________

---

## Feature 10007 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gpt-4o-mini, Quality: 0.6)
>  instances of the verb \"to be\" in various forms and contexts

### Activation Examples
**Quantile 3** (max=69.22, pos=[38, 39, 81, 96])
```
iteagarwassimilar,whetherafterenrichmentinRVmediumorinanyofthestudiedtetrathionatebrilliantgreenbroths.<bos>HotKnotisanear-fieldcommunicationtechnology(which[is][mainly]usedinacapacitivetouchscreen)usedinsomesmartterminaldevices.Thisnear-fieldcommunicationincludestwoprocesses:proximitydetectionprocessanddatatransmissionprocess.Theproximitydetectionprocessofthenear-fieldcommunication[is]:atouchscre...
```

**Quantile 3** (max=64.93, pos=[1, 8, 9, 24, 42])
```
components[are]meaningful,andstrongsoundcomponents[are][not]significant(ordoesnotappearfrequently),thefourhigh-orderbits[are]omitted.(3)Somehigh-orderbitsandsomelow-orderbits[are]omitted.Thismethod[is]intermediatebetweentheabove-mentionedmethods(1)and(2)andsuitableforcaseswherestrongandweaksoundcomponentsmust[be]handled.Itshould[be]notedthatnoneoftheabove-mentionedmethods(1),(2)and(3)provideadynam...
```

**Quantile 2** (max=53.58, pos=[3, 4, 5, 10, 11])
```
theShangemperor[is][not][their]greatestthreat.There[is][a]darkcursethathasplaguedtherulersofthelandforgenerations.ThemysteriousSonsoftheSkywhovisitHudaninherdreamshaveaplantodestroyit.,butcantheybetrusted?DreamingofZhouGongisabeautiful,evocativejourneythroughancientChina.LissaWilson’slifehasn’tbeenquitethesamesincepeopleshecaredaboutstartedgettingthemselveskilled.Byvampires.AndLissalearntthattheop...
```

**Quantile 2** (max=52.78, pos=[5, 16, 28])
```
insane,andthethird[was]himself,buthehadforgottenit.This[was]convenientforPalmerston,asthegovernmentknewthatBritainwas[almost]powerlessonthecontinentandhadnochanceofcounteringPrussia'smilitaryormanufacturingmight.Meanwhile,in1864,theDanishroyalfamily,impressedbyVictoria'strappingsofEmpire,arrangedthemarriageofthePrincesstothefutureEdwardVII,sohelpingtoreversetheAnglo-Germanalliance,whichledtothe191...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.2142 |
| score_fuzz | 0.7583 |
| score_detection | 0.475 |
| explanation_semantic_sim | 0.3605 |

### Position: (0.5482, 0.3133)
### Distances: ngram=5.1496, context=3.8016, noisy=3.8024
### Current: **noisy_activation** (margin: 0.0008)

### Your Tag: _____________

---

## Feature 5864 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gpt-4o-mini, Quality: 0.3508)
> elements related to celebrity culture and success in the entertainment industry

### Activation Examples
**Quantile 3** (max=75.81, pos=[85, 90, 91, 93, 94])
```
mixofbrokers,celebrities,gurusandexperts.Hereareourhighlights.SpeakersWhileweworkinthefinanceindustrythere’smuchwecanlearnfromotherindustriesandtakebacktoourdayjobs.HearingfromAllanPeaseontheartofbodylanguagewasaneyeopener,GraemeEdwardsfromtheQueenslandPoliceshowedustheimportanceofcybersecurityforwhileAdamFranklinshowcasedhisgurucredentialswithamasterclassonsocial[media]marketing-amust[for][any]br...
```

**Quantile 3** (max=68.25, pos=[43, 56, 57, 58, 59])
```
phoenixfellfromtheskyandcrashedintohiscar.InNovember,2010,Westreleasedadocumentaryaboutthecarcrashcalled"Runaway".Onaninterviewdiscussingthedocumentary,Kanyementionedthat[becoming]thegreatestrappereverwasonhis"bucketlist"[Rise][to][Yeast]Kay[ne][was]namedafterMaeWestashehadan[inflated]opinionofhimself.Kanyewasaproducerformany[no][-][names]in[the]late90[']s[,][most][of][whom][are][not][even][worth]...
```

**Quantile 2** (max=62.27, pos=[9, 12, 23, 24, 25])
```
asaproducer.Kanyehaseversincefelt[that]Jay-[Z]washisBigBrother.KanyeWest's[first][career][productions][came][on]Jay-Z's2001debutalbumTheBlueprint,releasedonSeptember11,2001.Westproducedsomeofthegreatesthitsonthatalbum[,]suchasHeartoftheCityandI.Z.Z.O.[Kanye]alsothoughthe[was][“]theshit”(but[nobody][knew][of][him][yet])and[starting][“]smokingthemmiracleherbs”and[developed][an]addictiontothem.Kanyed...
```

**Quantile 2** (max=62.15, pos=[42, 59, 61, 62, 63])
```
careerproductionscameonJay-Z's2001debutalbumTheBlueprint,releasedonSeptember11,2001.Westproducedsomeofthegreatesthitsonthatalbum[,]suchasHeartoftheCityandI.Z.Z.O.Kanye[also]thought[he][was][“]theshit[”](but[nobody][knew][of][him][yet])and[starting][“]smokingthemmiracleherbs”and[developed][an]addictiontothem.Kanyedocuments[his][rise][to][fame]ina13-hourinterviewnamed"LastCall"onhis2004AlbumTheColle...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2333 |
| score_embedding | 0.0767 |
| score_fuzz | 0.4 |
| score_detection | 0.4917 |
| explanation_semantic_sim | 0.3497 |

### Position: (0.4861, 0.2973)
### Distances: ngram=3.7004, context=4.0968, noisy=3.6992
### Current: **missed_context** (margin: 0.0012)

### Your Tag: _____________

---

## Feature 13827 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.38)
> steering wheel

### Activation Examples
**Quantile 3** (max=112.08, pos=[3, 4, 5, 6, 7])
```
6engines–[steering][wheel][-][mounted][paddle][shi][fters][were]available.However,[these][are][now]beingoffered(eitheras[a]standardinclusivefitment,orasafactoryoptionalextra)onvirtuallyallDSG-equippedcars,throughoutallmodelranges,includinglesserpoweroutputapplications,suchasthe105PSVolkswagenGolfPlus.[These][operate][in][an]identicalmanner[as][the][floor][mounted][shift][lever][when][it][is][place...
```

**Quantile 3** (max=110.71, pos=[12, 18, 19, 20, 21])
```
ofsophistication.StunningInteriorTheall-newPeugeot3008SUV[features][the][stunning][new][generation][Peugeot]i[-][Cock][pit][®][which][well]and[truly][brings][you][into][the]digitalage[.][The][compact][steering][wheel][,][sleek][head][up][1][2][.]3[”][head][up][instrument][panel][and][8][”][capacitive][touch][screen][all]combine[to][bring][you][an][incredible][driving]experience[.][The][stain][chro...
```

**Quantile 2** (max=105.74, pos=[10, 34, 60, 61, 65])
```
areaforaquickrecharge.180[Degree]ReversingCameraWiththecrystalclearviewsprovidedbythe180degreereversingcamerainthenewPeugeot3008SUV,you’llneverneedtoworryaboutwhat’sbehindyou.Thecameralinksdirectlyto[your]8.0[”][capacitive][colour][touchscreen]andoffersyouanumberofviews,including:RearGridView–allowsyoutoviewobstructionswhile[the]gridlinesofferperspectivefordistancesofoneandtwometresbehindthebumper...
```

**Quantile 2** (max=104.11, pos=[82, 84, 85, 87, 88])
```
33transmission,thiswastheultimatemusclecarofitsday.This1971PlymouthHemi'CudaConvertiblewithblackpaintandorangebillboardswasofferedforsaleatthe2006RMAuctioninMonterey,CAwhereitwasexpectedtosellbetween$180,000-$220,000.Itcameequippedfromthefactorywith[power]windows[,][power]brakes[,][power][steering][,][Rally][instrument][cluster][,][rim][blow][steering][wheel][,]bucketseats[,]AM/FMcassetteradio[,][...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.1342 |
| score_fuzz | 0.425 |
| score_detection | 0.4083 |
| explanation_semantic_sim | 0.2809 |

### Position: (0.5137, 0.2962)
### Distances: ngram=3.9285, context=3.7415, noisy=3.742
### Current: **noisy_activation** (margin: 0.0005)

### Your Tag: _____________

---

## Feature 6767 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4108)
> Proper nouns, abbreviations, and names of organizations, institutions, and individuals, often denoting specific entities, titles, or affiliations.

### Activation Examples
**Quantile 3** (max=84.54, pos=[18, 19, 20, 21, 22])
```
014appropriationfortheDepartmentofEnergy(DOE)scienceandresearchprograms.The[ASM][is][the][largest][single][life][science][organization][in][the][world][with][more][than][3][7][,][0]0[0][members][.][The][ASM][mission][is][to][enhance][the][science][of][microbiology][,][to][gain][a][better][understanding][of]lifeprocesses[,][and][to][promote][the][application][of][this][knowledge][for][improved]heal...
```

**Quantile 3** (max=76.22, pos=[37, 38, 39, 40, 41])
```
PersolKellyAPAC,ajointventurebetweenKellyServicesandPersolHoldingsCo.,Ltd.Inaddition,Mr.QuigleyservesasanactiveboardmemberoftheAmericanStaffing[Association][(][ASA][),][serving][as][second][vice][chairman][of][the][ASA]'[s][board][of][directors][,][vice]-[chair][of][the][thought][leadership][task][force][,][and][a][member][of][the][legal][and][legislative][committee].Mr.[Quig][ley][has]been[named]...
```

**Quantile 2** (max=58.41, pos=[69, 70, 71, 72, 73])
```
mold,thebottompunchnotbeingpositivelydrivenexternally.Thisnotonlyresultsinincreasedtoolwearinthisregion,butalsoleadstoanunevendensitydistributioninthepressedarticle.Apresswithelectronicallycontrolledmovementswhichisusedfortherotarypressprocessisdescribedinthepublicationentitled"Qualitycontrolthroughprocessmonitoringofrotaryformingpress",Metal[Powder][industries][Federation][,][Volume]6[,][May]6-11...
```

**Quantile 2** (max=57.76, pos=[20, 21, 22, 23, 26])
```
putherhandson,includingthebacksofcerealboxesandketchupbottles.ThewinneroftheChristy[Award][for][Excellence][in]ChristianFiction[(]WhispersfromYesterday),theR[ITA][Award][for][Best][Inspirational][Romance](PatternsofLoveandTheShepherd'sVoice),two[RT][Career][Achievement][Awards][(]Americana[Romance][and]InspirationalFiction),[and][the]R[WA][Lifetime][Achievement][Award],Robin[is][the]authorofover50...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1825 |
| score_embedding | 0.275 |
| score_fuzz | 0.375 |
| score_detection | 0.3167 |
| explanation_semantic_sim | 0.5253 |

### Position: (0.4998, 0.2332)
### Distances: ngram=3.5838, context=3.5842, noisy=4.9341
### Current: **missed_ngram** (margin: 0.0004)

### Your Tag: _____________

---

## Feature 1669 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4208)
> Function words and common verbs, often used in formal or technical writing, and sometimes preceding or following nouns or phrases that convey specific information or actions.

### Activation Examples
**Quantile 3** (max=86.8, pos=[5, 6, 7, 9, 10])
```
ofcustomers’bills,[made][“][no]hidden[profits][”][and]had[a][profit][margin][of][3][.]2per[cent][in]thefirstninemonthsof2013.TheyalsocomplainedthatGovernmentregulations[on]energywouldadd£308tobillsby2020.Theirreport,EnergyExplained,wasslammedbyregulatorOfgem,whosaiditcontained“incorrectandmisleading”figures[on][the]costoftheUK’senergysupplynetwork.InOctober,Massaraclaimedonthenpowerwebsitethat[8]4...
```

**Quantile 3** (max=78.69, pos=[11, 70, 71, 73, 75])
```
ouslyclose),couldbecomelow-orevenmedium-[margin]productsonceAmazonhonestheirsupplychainandcanestablishthemselvesasastandard.'dunno,Icouldbewrong,butIthinkAmazonhassomethinggoodgoingon,strategically.ThediscussionlookmarkandjohnsonwaxarehavingiswhatIfindsopuzzlingabouttheKindlestrategy:the[hardware][is]a[loss]leader[at][worst][,][break][even]at[best][.][They][can]'[t][be][making][a][significant][amo...
```

**Quantile 2** (max=70.34, pos=[65, 66, 87, 101, 102])
```
abouthistorywhattheyhavelearnedinschool,seeinmovies,andonTVdramas,whichisoftenhistoricallyinaccurate.ItwasblackAfricansthemselveswhooriginatedtheblackslavetrade.Simplyput,onetribewouldraidthevillageofanenemytribeandsellthepeopletheycaughttowhitemerchantshipcaptainsoffthecoastof[Africa][.]After1808,slavetradingfromtheUnitedStateswastechnicallyillegal,buttherewere[still]slavesmugglingshipsfromtheUni...
```

**Quantile 2** (max=69.59, pos=[27, 49, 50, 51, 58])
```
thenimmediatelyreleaseandfreeforever(“emancipate”)one’sfamilymember.Thefactthatthekeptthemasslaveslongenough[to]havethemlistedonadecennialcensusputsthelietothat.Blackamericansboughtandsoldslaves[for][the][same]reasonsblackafricansalwayshave[:][to][make][money]!BlackinHaitikeepslavestothisverydayfor[the]samereason[:][they][are]cheap[explo]itablelabor.Google“restavek”.ShermanMcCoyIfblacksweretreated...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.375 |
| score_embedding | 0.3242 |
| score_fuzz | 0.3833 |
| score_detection | 0.3083 |
| explanation_semantic_sim | 0.3522 |

### Position: (0.5035, 0.2742)
### Distances: ngram=3.6194, context=3.6197, noisy=3.9895
### Current: **missed_context** (margin: 0.0003)

### Your Tag: _____________

---

## Feature 10643 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.44)
> Function words and prepositions, often used to introduce or connect clauses, phrases, or ideas, and sometimes used to indicate relationships between entities or actions.

### Activation Examples
**Quantile 3** (max=54.49, pos=[5, 12, 15, 17, 20])
```
,withrespecttostatements[regarding]thegoals,progress,timing[,]andoutcomes[of]discussions[with]regulatoryauthorities[,][and]in[particular]thepotentialgoals[,]progress,timing,andresults[of]preclinicalstudies[and]clinicaltrials[,][actual]resultsmaydiffermaterially[from][those]setforth[in]thisrelease[due][to][the]risksanduncertaintiesinherent[in][our]business[,][including][,]without[limitation][:][the...
```

**Quantile 3** (max=52.97, pos=[9, 10, 12, 13, 14])
```
thisreleaseduetotherisksanduncertaintiesinherent[in][our]business[,][including][,]without[limitation][:][the][potential][that][results][of]clinicalorpreclinical[studies][indicate][that][the]productcandidatesareunsafeorineffective[;]the[potential][that]it[may]be[difficult][to][enroll]patients[in]ourclinicaltrials[;]the[potential][that]regulatoryauthorities[,][including]theFDA,EMA,andPMDA,maynot[gra...
```

**Quantile 2** (max=47.78, pos=[29, 30, 34, 39, 41])
```
need.Forfurtherinformation,pleasevisittheCompany'swebsitewww.santhera.com.Disclaimer/Forward-lookingstatements[This]communicationdoesnot[constitute]anofferorinvitation[to]subscribe[for]or[purchase][any]securitiesofSantheraPharmaceuticalsHoldingAG[.][This]publication[may][contain][certain]forward-looking[statements][concerning][the][Company][and][its]business[.][Such][statements][involve][certain]r...
```

**Quantile 2** (max=47.76, pos=[11, 22, 23, 24, 29])
```
callingthehashCodemethodoneachofthetwoobjectsmust[produce]thesameintegerresult.Itisnotrequired[that][if][two]objectsareunequalaccording[to]theequals(java.lang.Object)method[,][then][calling]thehashCodemethod[on][each][of]thetwoobjectsmust[produce]distinctintegerresults[.][However][,]theprogrammershouldbe[aware][that][producing][distinct]integerresults[for]unequalobjectsmay[improve]theperformance[o...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.65 |
| score_embedding | 0.0692 |
| score_fuzz | 0.55 |
| score_detection | 0.4667 |
| explanation_semantic_sim | 0.2842 |

### Position: (0.5233, 0.3043)
### Distances: ngram=4.4281, context=3.7801, noisy=3.7804
### Current: **noisy_activation** (margin: 0.0004)

### Your Tag: _____________

---

## Feature 12772 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gpt-4o-mini, Quality: 0.8458)
>  instances of the word \"this\" in various contexts

### Activation Examples
**Quantile 3** (max=117.19, pos=[83, 84, 105])
```
PipefittersLocal636,PlannedParenthoodActionFund,TheSierraClubanddozensofothercommunityleadersandorganizations.Pleaseletmeknowifwecanaddyournametoourlistofendorsers.Toseethecurrentroster,visitwww.brendalawrence.comOpeningourDetroitCampaignOfficeWe’realreadyoutinthecommunity,continuingtobuildgrassrootssupport.[This][Saturday],April23rdwe’reofficiallyopeningourDetroitCampaignOffice.Pleasejoinusfor[th...
```

**Quantile 3** (max=109.14, pos=[35, 36, 62])
```
thesouthernflank.Theregionhasbeenhithardbyfiresinthepast,themostsignificantin1987,whichclaimedthelifeofafirefighter.[This][week]'sfirehasbroughtsorrowamongthedistrict'semployees,whonotonlyrecallthepastdevastationbutalsobegrudgethe[current]damage.Thefireburnedthoughanareathathadapending$1-milliontimbersale,saidMaggieDowd,districtrangerintheGrovelandRangerDistrict."Theeconomicimpactsarereal,butwehav...
```

**Quantile 2** (max=95.97, pos=[66])
```
looking!You’vefoundit!<bos>PressNewWellesleyBusinessWantsToTeachTheWorldToSew!LaurenJohnstonisdoingherparttoensuresewingdoesn’tbecomealostart.SewEasy,abusinessshestarted15yearsagoinNeedhamtoteachkidsandteenshowtosew,expanded[this]summerintoasecondfloorspaceinWellesleyat159LindenSt.3C.Seweasy,whichbeginsitsnext8-weeksessioninWellesleyonSept.17,hastaughtmorethan9,000girlsandboystosewovertheyears
```

**Quantile 2** (max=95.01, pos=[112, 113])
```
http://www.canisius.edu/griffinJuniorEricaTurneristheChairpersonoftheRecyclingCommittee.stillneedtobecompletedbystudents.AnystudentsinterestedinhelpingwiththeprogramshouldcontactEricaTurneratturnere@canisius.edu.APhysicalPlantwebsitewhichwillhandlequestionsabouttheprogramwillalsobeavailablesoonthroughtheCollegesofficialwebsite.Although,saysErica,"Itreallywouldn'thavebeenpossiblewithoutthesupportfr...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.7442 |
| score_fuzz | 0.6833 |
| score_detection | 0.5083 |
| explanation_semantic_sim | 0.3846 |

### Position: (0.4888, 0.2947)
### Distances: ngram=5.8077, context=6.2515, noisy=5.8074
### Current: **missed_ngram** (margin: 0.0003)

### Your Tag: _____________

---

## Feature 7538 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.3642)
> programming keywords

### Activation Examples
**Quantile 3** (max=86.38, pos=[17, 21, 23, 24, 25])
```
,WeatherTodayModel>CACHE=newHashMap<String,WeatherTodayModel>();/**城市ID[*/][@][SerializedName]("cityid[")][public]Stringid[;]/**城市名称[*/][@][SerializedName]("city[")][public]StringcityName;/**温度[*/][public]Stringtemp;/**天气*/[public]Stringweather;/**风向*/[@][SerializedName]("WD[")][public]Stringwind;/**风力*/@SerializedName("WS[")][public]Stringws;/**湿度*/@
```

**Quantile 3** (max=86.28, pos=[16, 18, 23, 25, 26])
```
'],templateUrl:'./product-suggestion.component.html'[})][export]classProductSuggestionComponent[{][@][Input][()]products:Product[[];]readonlycolumns$:Observable<number>;readonlybreakpointsToColumnsNumber=newMap([['xs',2],['sm',3],['md',5],['lg',2],['xl',3],]);[constructor][(][@][Inject][(]APIBASE[URL][)][private][readonly]baseUrl:string[,][private][readonly]
```

**Quantile 2** (max=79.13, pos=[2, 3, 4, 5, 6])
```
=null[;][@][SerializedName]("onewaycurrency[")][private]StringmOnewayCurrency=null;[@]SerializedName("onewayprice[")]privateStringmOnewayPrice=null;[@]SerializedName("originairport[")]privateStringmOriginAirport=null;@SerializedName("origincity")privateStringmOriginCity=null;@SerializedName("price[")]privateStringmPrice=null;@SerializedName("sanitizedimages[")]privateList<String>mSanitizedImages=n...
```

**Quantile 2** (max=78.11, pos=[16, 18, 22, 23, 27])
```
/***@ORM\Entity()*/classOrderextendsAbstractEntity[{]//...[/**]*[@]ORM\[ManyToOne][(]targetEntity="Status[")][*][@]ORM[\]JoinColumn(onDelete="NOACTION",nullable=false[)][*/][protected]$status;/**@ORM\[Column][(]nullable=[true][)][*/][protected]$stringProperty="defaultvalue";}Ineedtosetthisstatuspropertytoadefaultvaluewhencreatinganewinstanceoftheorderobject.Fora"non-relation"propertyIcansimplyseti...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.331 |
| score_embedding | 0.0317 |
| score_fuzz | 0.475 |
| score_detection | 0.5167 |
| explanation_semantic_sim | 0.5468 |

### Position: (0.4995, 0.2366)
### Distances: ngram=3.7115, context=3.7114, noisy=4.9339
### Current: **missed_context** (margin: 0.0001)

### Your Tag: _____________

---
