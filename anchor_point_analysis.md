# Anchor Point Analysis - Feature Samples

Generated: 2026-01-04 23:23

## Tag Options (Problem Categories Only)
- `noisy-activation`: Activation examples are noisy/not interpretable - the feature itself is poorly defined
- `pattern-miss`: Explanation missed the linguistic pattern (n-grams, morphology) that triggers activation
- `context-miss`: Explanation missed the semantic context/domain where the feature activates

Note: Every feature MUST be tagged with one of these three categories.

---

## Feature 11231 (diverse: grid_0_0)

### Best Explanation (gemini-flash-2.5, Quality: 0.3917)
> weather data, code, and math

### Activation Examples
**Quantile 3** (max=72.49, pos=[38, 39, 53, 71, 77])
```
VRXFORCEACK(1U)#defineSRXDACKMODE29#defineMRXDACKMODE[0][x]3#defineVRXDACKMODE([x])((x)<<SRXDACKMODE)#define[G]RXDACKMODE[(]x)(((x)>>SRXDACKMODE)&MRXDACKMODE)#defineSRXDACKCHANGE31#define[V]RXD
```

**Quantile 3** (max=64.8, pos=[23, 56, 69, 70, 91])
```
Stringid=cursor.getString(cursor.getColumnIndex(WeatherDataHelper.WeatherDBInfo.ID));[Weather]TodayModelmodel=getFromCache(id);if(model!=null){returnmodel;}model=new[Gson]().fromJson(cursor.getString(cursor.getColumnIndex(Weather[Today][Data]Helper.WeatherTodayDBInfo.JSON)),WeatherTodayModel.class);addToCache([model]);returnmodel;}publicstaticclassWeatherTodayRequestData{publicWeatherTodayModelwea...
```

**Quantile 2** (max=51.43, pos=[26, 29, 47, 66, 90])
```
highestcommondivisorof29and1752905.29Whatisthehighestcommon[factor]of[1]89937and3751?341[Calculate]thegreatestcommondivisorof86and149167.[4]3Whatisthehighestcommondivisorof272251and665?[1]33[What][is]thehighestcommon[divisor]of59and3127[?]59[Calculate]thegreatestcommon[factor]of[5]10and
```

**Quantile 2** (max=50.41, pos=[65, 67, 69, 71, 72])
```
A(x){(\theta+Z{j-1,\theta}^{(x)})/(1+Z{j-1,\theta}^{(x)})\over\E[(\theta+Z{j-1,\theta}^{(x)})/(1+[Z]{[j]-[1],[\]theta}^{(x)})]}\ge\sum{x\in\T1}A(x){[Z]{j-1,\theta[}^{(]x[)}]/(1+[Z]{j-1,\[theta]}^{(
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2482 |
| score_embedding | 0.4092 |
| score_fuzz | 0.1833 |
| score_detection | 0.4 |
| explanation_semantic_sim | 0.4949 |

### Position: (0.368, 0.1973)
### Distances: ngram=2.3248, context=4.7528, noisy=5.1184
### Current: **missed_ngram** (margin: 2.428)

### Your Tag: _____________

---

## Feature 5123 (diverse: grid_0_0)

### Best Explanation (gemini-flash-2.5, Quality: 0.4425)
> include directives and headers

### Activation Examples
**Quantile 3** (max=147.41, pos=[7, 8, 9, 10, 11])
```
alibrarythecontainsaclassin[one][file][and][the][main][in][another][file][,][all][linked][into][my][library][.][The][library][is][providing][the]basisfor[a]ProcessFramework,whichiswhythe[main][is][in][the][library][and][not][the]process.Below[is][a]stripped[down][version][of]whatIhave[.][pf][.][hpp][using]namespace[std];namespace[My][Namespace][{]classProcessManager[{][public]:[friend]int[main](in...
```

**Quantile 3** (max=142.96, pos=[1, 2, 3, 4, 5])
```
UIKit[.][h][>][#][else][#][ifndef][FOUNDATION][EXPORT][#][if][defined][(__][cplusplus][)][#][define][FOUNDATION][EXPORT][extern]["][C]["][#][else][#][define]FOUNDATION[EXPORT][extern][#][endif][#][endif][#][endif][FOUND][ATION][EXPORT]doubleQuickLayout[Version][Number][;]FOUND[ATION][EXPORT][const][unsigned][char]Quick[Layout][Version][String][];[<bos>][Q][:]Can[someone][explain][how]Salesforcewor...
```

**Quantile 2** (max=135.98, pos=[6, 7, 8, 9, 10])
```
.txt)[//][Authors][:][Douglas][Gregor][//][Andrew][L]umsdaine[#][ifndef][BOOST][GRAPH][DETAIL][REMOTE][UPDATE][SET][HPP][#][define][BOOST]GRAPHDETAILREMOTEUPDATE[SET][HPP][#][ifndef][BOOST][GRAPH][USE][MPI][#][error]["][Parallel][B][GL][files][should][not][be][included][unless][<][boost][/][graph][/][use][mpi][.][hpp][>][has][been][included]["][#][endif][#][include][<][boost][/][graph][/][parallel...
```

**Quantile 2** (max=135.64, pos=[50, 51, 52, 53, 55])
```
thecorrection$\theta1$inthemiddleoftheskyrmionwhen$\cos\theta0=0$comesfromthefactthatthemagnetizationispoorlydefinedhere,asitwasdiscussedabove.<bos>Q:nodefault[constructor][exists][I]'[m][having][some][trouble][with][a][class][that][was][working][fine]and[now]doesn['][t]seem[to][want][to][work][at]all[.][The][error][is]["][No][appropriate][default][constructor][available]["][I][am][using][the][cla...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4141 |
| score_embedding | 0.45 |
| score_fuzz | 0.2833 |
| score_detection | 0.45 |
| explanation_semantic_sim | 0.4914 |

### Position: (0.3761, 0.2062)
### Distances: ngram=2.3439, context=4.6125, noisy=4.848
### Current: **missed_ngram** (margin: 2.2686)

### Your Tag: _____________

---

## Feature 11699 (diverse: grid_0_1)

### Best Explanation (gemini-flash-2.5, Quality: 0.4142)
> parsing, encoding, or persistence objects

### Activation Examples
**Quantile 3** (max=158.57, pos=[4, 8, 9, 10, 16])
```
Object);@[implementation]TAPIResponse[@][synthesize]apiError=api[Error];@synthesize[parse]Error=parse[Error];@[synthesize][parsed][Object]=parsed[Object];-([void][)][prepare][{][superprepare];if(!_[operation]Error)[{]NSError*api[Error];NSError*[parse]Error;parsedObject[=][Parse][API][Response][(_][info],&parseError,&apiError);parseError=parse[Error];apiError=[api]Error;[T]NLAttemptMetrics*metrics=...
```

**Quantile 3** (max=138.38, pos=[7, 8, 17, 21, 27])
```
CodingError(_parseError)forKey[:@"][parse]Error"];}-(NSError[*)]anyError[{]returnself.[operation]Error?:[self][.][parse]Error?:[self][.][api]Error;}@endstaticid[Parse][API]Response[(][T]NLResponseInfo*info,NSError**errorOut,NSError[**]apiErrorOut)[{]id[json]=nil;NSError*[parse][Error]=[nil];blockNSError*apiError=[T]NLHTTPStatusCodeIsSuccess(info.statusCode)?nil:[NSErrorerrorWithDomain:TAPIErrorDom...
```

**Quantile 2** (max=116.03, pos=[4, 8, 9, 10, 11])
```
coderdecodeObjectOfClass[:[]NSErrorclass][forKey][:@"][parse][Error]"];[api]Error=[[][coder][decode][Object]OfClass[:[]NSErrorclass]forKey[:@"][api]Error"];}returnself;}-([void][)]encodeWithCoder[:(]NSC[oder][*)][a][Coder][{][[][super]encodeWithCoder:[a][Coder]];[[]a[Coder]encode[Object][:][TN]LErrorTo[Secure]CodingError(_[parsed]Object)[forKey][:@"]parsedObject"];[[a]CoderencodeObject:TNLErrorToS...
```

**Quantile 2** (max=93.65, pos=[22, 35, 36, 39, 43])
```
ifitexists)andhowwouldyouuselistpropertiesinJava,inJPAand/orinJ[DO]?A:Seemyblogpostexactlyonthis[:][Efficient]KeywordSearch[with]RelationIndexEntities[and][Objec][tify][for][Google][Data][store].Ittalks[about][implementing]search[with][list]properties[using][Relation][Index]Entities[and][Objec][tify].Tosummarize:[Query][<][Document][Keywords][>][query][=][of][y][.][query][(]Document[Keywords][.][c...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3118 |
| score_embedding | 0.435 |
| score_fuzz | 0.325 |
| score_detection | 0.425 |
| explanation_semantic_sim | 0.4978 |

### Position: (0.4115, 0.229)
### Distances: ngram=2.708, context=4.4131, noisy=4.6754
### Current: **missed_ngram** (margin: 1.7051)

### Your Tag: _____________

---

## Feature 1959 (diverse: grid_0_1)

### Best Explanation (gpt-4o-mini, Quality: 0.5967)
>  programming-related terms and structures, specifically function definitions and parameters

### Activation Examples
**Quantile 3** (max=128.38, pos=[9, 10, 14, 15, 16])
```
','top','right','bottom[',][and]'chartArea['][*][@][prop]{Number}weight-Theweightusedtosorttheitem.Higherweightsarefurtherawayfrom[the]chart[area]*[@]prop{Boolean}fullWidth-iftrue,andthe[item]ishorizontal,thenpushverticalboxesdown*[@]prop{Function}isHorizontal-returns[true][if][the]layoutitemishorizontal(ie.toporbottom)[*][@]prop{Function}update[-][Takes][two][parameters][:][width]and[height][.]Re...
```

**Quantile 3** (max=122.91, pos=[3, 4, 5, 6, 9])
```
useLoadImage[();][,][what][equivalent]isthere[that][can][handle][non]-[constant][file][names]?[EDIT][Apparently],[the]errorwascausedbyanotherbitofcode,andnottheLoadImage[()][function].Disragerd.A:Itseemstobe[the]timer.[The]documentation[about][the]SetTimerfunctionsays[that][the][second][parameter][(][n]ID[Event][)][must][be][a][nonzero][value][.][So][,]Iimagine[your][timer]isneverfiring,[the]execm...
```

**Quantile 2** (max=98.86, pos=[7, 15, 16, 17, 18])
```
.theo2nodeandthen[passed]onthedocumenttothereadRecords[()][method][as][the][natural]flowis.Thoughkindofaworkaroundbutitisfineformeastheinnernodeisnotneededmycase.<bos>Q:DownloadOSXAppStoreupdatestoupdatemultipleMacsIhavetwoMacBookAirs,butIhaveverylimitedbandwidth.IwouldprefertodownloadupdatesonceandthencopythemontoalltheotherMacBookAirs.HowcanIdownloadAppStoreupdatesoncetoupdatemultipleMacs?A:Ther...
```

**Quantile 2** (max=97.56, pos=[0, 2, 3, 4, 10])
```
[Parameters]'[and][no][extension]method'AddQueryStringParameters['][accepting][a][first][argument][of][type]'[System][.]Web.Routing.[Route][Value][Dictionary]['][could]befound([are]youmissing[a]usingdirectiveoranassemblyreference?).IamnotsureifIneedtoaddadllreferenceorsomethingelse.Pleasecouldsomeoneadvisehowtosolvethisthanksinadvance.AlsoIdownloadedthedemoandthereisnoproblem.errorisinPagerLink.as...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3 |
| score_embedding | 0.3742 |
| score_fuzz | 0.4083 |
| score_detection | 0.5917 |
| explanation_semantic_sim | 0.4684 |

### Position: (0.4082, 0.2627)
### Distances: ngram=2.9642, context=4.9559, noisy=4.1934
### Current: **missed_ngram** (margin: 1.2291)

### Your Tag: _____________

---

## Feature 9782 (diverse: grid_0_2)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.58)
> Various words and phrases that appear to be significant or important in the context of the surrounding text, often indicating a transition, explanation, or emphasis.

### Activation Examples
**Quantile 3** (max=69.65, pos=[1, 2, 3, 5, 6])
```
or[underscore][characters][.][Here][read][more][about]it:http://docs.oracle.com/javase/tutorial/java/nutsandbolts/variables.[html][A][:][if][you][are][creating][method][setDescription][then][it][wh][ould][be][:][public]voidsetDescription[(]String[content]encoded[)]{description=contentencoded;[}][Here][public][is][modifier][void][is][return][type][setDescription][is][method][name][String][is][param...
```

**Quantile 3** (max=62.15, pos=[1, 2, 3, 94, 95])
```
button[layout][that][will]remindyouofretro8-bitgameconsolesbackfromthe1980sand1990s.Itisbatterypowered,andwillhookuptoyourdevicewirelessly,lettingyourfingersrunalloverthefully-functionaldirectionalgamepadandeightbuttons.A$24.99askingpriceisnottoomuchtoforkout,isit?<bos>Q:HowdoIaccessaninstanceof[a][class][that][is][inside][an][arrayList][I][am][doing][a][MO]OCand[am][supposed][to][return][a][numbe...
```

**Quantile 2** (max=56.34, pos=[16, 17, 18, 19, 20])
```
andusethemin[src]="imagMap.get(product.id[)"][and][in][the][service][of][image][:-]ImageInfo(id){varself=this;this.Global.refreshToken().subscribe(function(result){self.homeService.getImage(id).then(function(resultado){if(resultado){self.Images=resultado;self.imagMap.set(id,resultado);}}).catch();});[}][and][this][way][it][will][keep][track][of][every][individual][image][being][stored]<bos>
```

**Quantile 2** (max=56.29, pos=[17, 18, 21, 22, 23])
```
Tribute[genreid]=>["2","5","20"][//][it]doesn'[t][display][the][name][actors]=>[][trailerurl]=>https://drive.google.com/)[I][tried][the][following][code]$this->db->getwhere('genre',array('genreid'=>$row['genreid']))->row()->name[;][above][code][works][for][0][index][but][it]doesn['][t][work][1][index][array][A]:You[can]usewhere[in][but][you][can]'[t][use][it][with]get[where][,][you]
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3139 |
| score_embedding | 0.3942 |
| score_fuzz | 0.3667 |
| score_detection | 0.475 |
| explanation_semantic_sim | 0.3879 |

### Position: (0.4078, 0.2839)
### Distances: ngram=3.0831, context=4.7797, noisy=3.9295
### Current: **noisy_activation** (margin: 0.8464)

### Your Tag: _____________

---

## Feature 15670 (diverse: grid_1_0)

### Best Explanation (gpt-4o-mini, Quality: 0.32)
>  mathematical expressions and symbols related to equations and inequalities

### Activation Examples
**Quantile 3** (max=121.73, pos=[17, 18, 19, 36, 37])
```
average}H{k:m}&=\frac{1}{m[-][k][+]1}\sum{n=k}^m\{h(X^{(n)})[+][\]sum{\ell=n[+]1}^{\tau[-][1][}][(]h(X^{(\ell)})[-][h]({\tilde{X}}^{(\ell[-]1)}))\}\nonumber\\&=[\]frac{1}{[m][-][k][+]1}\sum{n=k}^mh(X^{(n)})[+][\]sum{n[=]k[+]1}^{\tau[-][1][}]\frac{\min([m][-]
```

**Quantile 3** (max=103.67, pos=[16, 17])
```
X}$withcrossoverprobability$p\!=\!\frac{1}{L[-][1]}\sum{i=2}^Lp{i}\!\approx\!0.0088$,i.e.,theerrorprobabilityaveragedoverallusedcoefficients.In[@benimdissertation],weshowthatthe$\text{BCH}(255,131,37)$codeachieves$(R{\text{s,BCH}},R{\ell,\text{BCH}})\approx(0.514,\,0.486)$bits/source-bit,significantlybetterthanpreviouslyproposed
```

**Quantile 2** (max=98.27, pos=[4, 5, 12, 13, 14])
```
{x{j[-][1]}^*}{xj^[*-][x][{]j[-][1]}^*}\ln\Big(\frac{x{j[-]1}^*}{xj^*}\Big).$$Since$xj^*=\frac{vj[-][v][{]j[-][1][}}{\]mum}$and$vj=\varepsilonm^{\frac{m[-][j][}{]m[-]1}}$,thequantities$\frac{xj^*}{[x][{]j[-]1}^*}$and,hence,$\frac{x{j[-]1}^*}{xj^[*-][x]{j-[1]}^*}$
```

**Quantile 2** (max=97.82, pos=[33, 75, 76, 79, 80])
```
arediscussedinExample\[ex3\]).Wedividetheinterval$[0,\infty)$in$m$intervals$Jj=[v{j[-]1},vj)$with:$$v0=0;\quadv1=\varepsilonm;\quadvj=\frac{\varepsilonm(m[-][1])}{m[-][j]};\quadvm=\infty;\quad\mum=\frac{1}{\varepsilonm([m][-][1])}.$$Todealwiththenon-compactnessproblem,wechoosesome“horizon
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4652 |
| score_embedding | 0.1858 |
| score_fuzz | 0.2833 |
| score_detection | 0.3917 |
| explanation_semantic_sim | 0.5822 |

### Position: (0.4389, 0.1895)
### Distances: ngram=2.767, context=3.7775, noisy=5.6773
### Current: **missed_ngram** (margin: 1.0104)

### Your Tag: _____________

---

## Feature 15499 (diverse: grid_1_0)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.2642)
> Code snippets in various programming languages, often including variable declarations, function calls, and assignments, with a focus on error handling and system calls.

### Activation Examples
**Quantile 3** (max=158.5, pos=[2, 3, 4, 5, 6])
```
go-[openapi][/][errors]["]["][github][.]com[/][go][-][openapi][/][str][fmt]["]["][github][.]com[/][go][-][openapi][/][swag]["]["][github].[com][/][go][-][openapi][/][validate]["][)][//]RegistrationViaAPI[Response]The[Response]forRegistrationFlowsviaAPI[//][//][swagger][:][model]registrationViaApiResponse[type]RegistrationViaAPI[Response][struct][{]//identity[//][Required][:][true][Identity][*][Ide...
```

**Quantile 3** (max=135.61, pos=[1, 2, 3, 4, 5])
```
struct[{][Base][Client][}][//][New][V]pn[Sites][Client][creates][an][instance][of][the]Vpn[Sites][Client][client][.][func][New]VpnSites[Client][(][subscription][ID][string][)][V]pn[Sites][Client][{][return][New]Vpn[Sites][Client][With][Base][URI][(][Default][Base][URI][,]subscription[ID][)][}][//][New]Vpn[Sites][Client][With][Base][URI][creates][an][instance][of][the]VpnSites[Client][client][.][fu...
```

**Quantile 2** (max=121.18, pos=[1, 2, 4, 5, 6])
```
((&[http][.]Request[{}][).][WithContext][(][ctx][))][}][//][Update][Tags][Sender][sends][the]Update[Tags][request][.][The][method][will][close][the][//][http][.][Response][Body][if][it][receives][an][error][.][func][(][client]Vpn[Sites][Client][)]Update[Tags][Sender][(][req][*][http][.][Request][)][(][future][V]pn[Sites][Update][Tags][Future][,][err][error][)]{[var][resp][*]http[.][Response][resp]...
```

**Quantile 2** (max=118.07, pos=[2, 4, 5, 6, 7])
```
[return][}][//][Create][OrUpdate][Responder][handles][the][response][to][the][Create][OrUpdate][request][.][The][method][always][//][closes][the][http][.][Response][Body][.][func][(][client]VpnSites[Client][)]Create[OrUpdate][Responder][(][resp][*][http][.][Response][)][(][result]VpnSite[,][err][error][)]{[err][=][auto][rest][.][Respond][(][resp][,][client][.][By][Inspect][ing][(),][azure][.][With...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4957 |
| score_embedding | 0.1875 |
| score_fuzz | 0.175 |
| score_detection | 0.2833 |
| explanation_semantic_sim | 0.5426 |

### Position: (0.4429, 0.1862)
### Distances: ngram=2.8415, context=3.7938, noisy=5.9559
### Current: **missed_ngram** (margin: 0.9523)

### Your Tag: _____________

---

## Feature 15348 (diverse: grid_1_1)

### Best Explanation (gemini-flash-2.5, Quality: 0.4249)
> .js, .message, .also, .military

### Activation Examples
**Quantile 3** (max=100.31, pos=[4, 6, 8, 9, 14])
```
DCS.Phone.[Views][{][public]partialclassServerView[:]M[vx][Phone]Page[,]IM[vx][Binding]ContextOwner{privateboolisUpdating;privateboolupdate;privateDcsTexttext;privateDcsInputinput;privateDcsListlist;private[D]csButtonbutton;publicIM[vx][Binding]Context[Binding]Context{get;set;}publicServerView(){InitializeComponent();[Binding][Context][=][new][M][vx][Binding]Context();Loaded+=newRoutedEventHandler...
```

**Quantile 3** (max=98.71, pos=[2])
```
App[.]1988).Insupportofhisargumentthatapublicationthathewasflirtatiouswouldbeanactionabledefamatorystatement,MoorereliesuponthecaseofScribnerv.WaffleHouse,Inc.,14F.Supp.2d873,915(ND1998),vacatedat62F.Supp.2d1186(1999).Undertheheading"DefamatoryMeaning"Moorestatesthat"AchargethatthePlaintiffwas"vulgarandflirt
```

**Quantile 2** (max=76.66, pos=[80, 81, 83, 89, 100])
```
someonefacedthisbefore.Thestrangestthingisthatit'sworkingwellwithfacebooklikebutton.Thanks!A:Theissueisthatwhenyouloadthetwitterwidgetitparsesthe<a>andthenreplacesitwithan<iframe>.Soevenwhenyouupdatethetextpropertyitdoesntreloadthebutton.Onewaytoworkarounditwouldbetorerender[the][view]when[the]textchangesthiswouldcause[the]iframetoberemovedandanewatagto[be]added.Ifixedup[the]jsbinto[update][the]bu...
```

**Quantile 2** (max=74.98, pos=[1])
```
App[.]2000)(quotingMitchellv.State,579So.2d45,48(Ala.Crim.App.1991),inturnquotingUnitedStatesv.Moore,895F.2d484,485(8thCir.1990)).Basedontherecord,weconcludethattheplaintiffsdidnotpresentaprimafaciecaseofimproperstrikesonthebasisofgender.InExparteTrawick,698So.2d162(Ala
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2662 |
| score_embedding | 0.3192 |
| score_fuzz | 0.3357 |
| score_detection | 0.3917 |
| explanation_semantic_sim | 0.3992 |

### Position: (0.4493, 0.2645)
### Distances: ngram=3.0263, context=4.0311, noisy=3.9882
### Current: **missed_ngram** (margin: 0.9619)

### Your Tag: _____________

---

## Feature 8280 (diverse: grid_1_1)

### Best Explanation (gemini-flash-2.5, Quality: 0.5208)
> integration and infinite sums

### Activation Examples
**Quantile 3** (max=114.7, pos=[5, 6, 7, 12, 13])
```
+U/2}\[operatorname][{][sign]}\omega,$$[where][the][prime][indicates][the][principal][value][.][The][integral][can][be][solved][analytically][as][an][infinite][sum][over][Mat]sub[ara][frequencies][,]seeAppendix\[app[:]B[ex]\][for]details[.][The]interplay[of]pseudospinaccumulation,pseudospinrelaxationandpseudospinprecessionintheexchangefieldleadstoanontrivialpseudospindynamicsonthedotwhichactsbacko...
```

**Quantile 3** (max=93.57, pos=[67, 68, 69, 70, 71])
```
particularfrequencyoffetalRM(rs=0.6,p<0.03).Giventheinvariabilityofα1regardingthemanifestationoffetalRM,weconsiderthattheHRshort-termfractalpropertiesareconvenientforassessingthecardiovascularprenatalregulation.<bos>Q:IntegrationbetweencircleandellipseIneed[to][evaluate][an][integral][over][the][$][D]=\{x^2+y^2>1;\frac{x^2}{a^2}+\frac[{]y[^]2}{b[^][2]}<1[\}$,][but][I][can]'[t][find][the][limits][o...
```

**Quantile 2** (max=88.01, pos=[66, 71, 72, 73, 74])
```
josephsonpossible1962].DiagramssuchasFig.\[fig:diagrams\](d)giverisetoalevelrenormalizationoftheemptyanddoublyoccupiedstaterelativetoeachotherand,thus,contributetotheexchangefieldinEq..\[app:Bex\]Exchangefield[integral]==================================[The][integral][appearing][in][the][expression]fortheexchange[field][can][be][solved][analytically][by][performing][the][substitution][$\][omega]\[...
```

**Quantile 2** (max=86.77, pos=[19, 20, 21, 22, 23])
```
6)and(37)of[@CaFi1999]).Wedefine[partial][sum][of][the][Borel][transform][,][expressed][as][a][function][of][the][conformal][variable][$]z[$,][as][$$][f]['][^{(\][lambda][),][m][}_{\][rm][B][}(][z][)][=][\][sum]{n[=][0]}^{[m][}][C][n][\,]z^[n]\,.$$[In][a]previousinvestigation[@CaFi19[9]9[],]CapriniandFischer[evaluate][the][following][transforms][,][$][$\]label[{]Ca[Fi][Trans][}][{\][cal][T]}'[m][f...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4583 |
| score_embedding | 0.37 |
| score_fuzz | 0.4167 |
| score_detection | 0.4583 |
| explanation_semantic_sim | 0.5018 |

### Position: (0.4437, 0.2349)
### Distances: ngram=3.0196, context=4.1094, noisy=4.6536
### Current: **missed_ngram** (margin: 1.0899)

### Your Tag: _____________

---

## Feature 1730 (diverse: grid_1_2)

### Best Explanation (gemini-flash-2.5, Quality: 0.4967)
> character depth and believability

### Activation Examples
**Quantile 3** (max=107.91, pos=[9, 10, 34, 39, 40])
```
herselfandinherownskinandnotjust[portraying][it]ontheoutsideorconvincingherselfthatshewashappy.Yougottareadthisbook.Bottomline.Laina[has]agreatwritingstyle[and][seems][to][have]aknack[for][making][her][characters][real][and][imaginative][.][I]wouldrecommendthisbookandIcan'twaitforhernextbook!IhaveaddedLainaasa'favauthor'.Thiswasafunread[with][twists][and][turns][and]Icouldn'twaitfor[her][next]book...
```

**Quantile 3** (max=86.46, pos=[29, 31, 32, 33, 34])
```
givingFrostbitea3.5/4outof5.“Inaworldthatseemssaturatedwithvampirebooks,Richelle[Mead]has[created][characters][and][a][world][that][is][both][unique][and][believable].”–TeensReadToo.comFivehours.TotaltimeittooktoreadRichelleMead’sVampireAcademy.Incrediblyquickread,[but]an[incredibly]goodbook.I[could]notputitdown.Okay,IputitdownacoupleoftimessoIcouldmovearound.Thismightsoundfamiliar,butIhaveneverre...
```

**Quantile 2** (max=78.46, pos=[8, 9, 10, 11, 18])
```
likewritingabookwithasetof[characters][you][can][leave]behindafteryou’refinished[.]Inacomicstrip[,][you][could]be[writing][about][these][characters]therestofyourlife[,][so][it]’s[important][they][have][legs][that][can][inspire]youforalongtime[.][I][have]always[liked]older[people][,][because][they]remindme[of]grandparents[.][I]drew[an]older[lady][and]mypersonallightbulbwenton.”Thefirst[characters][...
```

**Quantile 2** (max=72.17, pos=[54, 55, 56, 57, 58])
```
thinkarerightforthembecausetheywanttoseetheirdaughter(s)happyandtheywantgrand-kids.Heck,Iknowsomemotherswhoaskifthemanissingle(andaftergettingayes)shovehimattheirdaughterslol.Ilovedhow[real][and][well][developed][the][characters][were][.][I][could][see][myself]at[the]cafe[with][Presley][having]alargeblackcoffeewithcreamandtwosugarstalkingaboutallthemeninthetownorsittingatherandherbestfriendgrowing...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.309 |
| score_embedding | 0.4175 |
| score_fuzz | 0.5083 |
| score_detection | 0.5333 |
| explanation_semantic_sim | 0.4368 |

### Position: (0.4549, 0.3061)
### Distances: ngram=3.5732, context=4.6172, noisy=3.7374
### Current: **missed_ngram** (margin: 0.1642)

### Your Tag: _____________

---

## Feature 10055 (diverse: grid_1_2)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6973)
> Geographic locations, names of institutions, and specific titles or positions, often denoted by proper nouns.

### Activation Examples
**Quantile 3** (max=63.38, pos=[15, 16, 17, 25, 27])
```
–AfterthegroundbreakingonanelectriccarplantforIntegrityAutomotive,residents[and][city][officials]inSimpsonCountyhaveshowntheirsupport[by]ordering[three]electrictrucksfromZAP[.]LUBBOCK,TEXAS–Highgaspricesarechangingthelookof[city][vehicles][.][The][City][of][Lubbock][expects][to][start][replacing]full-[size]truckswithsmallerones[beginning][in][the]200[8][-]0[9][fiscal][year][,][which][starts][Oct][...
```

**Quantile 3** (max=59.2, pos=[87, 90, 91, 92, 93])
```
*******-11-ThedenialofDr.Zohoori’smotiontodismissthe§1983claim,theFMLAentitlementclaim,andtheFMLAdiscriminationclaimisreversed.Thiscaseisremandedforproceedingsconsistentwiththisopinion.-12-<bos>Micro-LoanProgramInordertopromoteeconomic[development]inthe[City][of][Alamo][,][the][Alamo][EDC][established][the][Alamo][Small][Business][Micro]-[Loan][Program](MLP)[with]assistance[from][USDA][–][Rural]De...
```

**Quantile 2** (max=55.99, pos=[25, 26, 27, 29, 30])
```
,notfarfromtheIllinoisstateline.Thetrailismorerusticthanmostrail-trailsand...TheEastNorth[brook][Trail][is]a[1]-[mile]route[through][a]woodedcorridoradjacent[to][an]out-of-servicerailcorridor[in][the][Village][of][North][brook][.][The]trail[provides]access[to]residentialneighborhoods,...[The]theFoxRiverTrail(FRT)wasbuiltonstretchesofthreeformerrailroads:Chicago,Aurora&Elgin;Aurora,Elgin,&FoxRiver[...
```

**Quantile 2** (max=54.56, pos=[59, 60, 61, 62, 64])
```
stillunaccountedfor.<bos>OURWORKTotrulyseeifMPistherightfirmtopartnerwithforyourproject,youshouldtakealookatthesuccessfulprojectsthatwehaveundertaken.Therealvalueofourfirmistheexpertiseandexperiencethatwecanbringtoyou.Bil[oxi][Athletic][Building][,]Bil[oxi],MS[The][Bil][oxi][Public][School][District]hiredM|PDesignGrouptodesign[a][new]stateofthe[art][athletic]facility[at]Bil[oxi]HighSchool.Thefacil...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.52 |
| score_fuzz | 0.6714 |
| score_detection | 0.75 |
| explanation_semantic_sim | 0.491 |

### Position: (0.4567, 0.3127)
### Distances: ngram=4.4151, context=5.7998, noisy=4.4455
### Current: **missed_ngram** (margin: 0.0304)

### Your Tag: _____________

---

## Feature 15983 (diverse: grid_1_3)

### Best Explanation (gemini-flash-2.5, Quality: 0.5983)
> assume a role

### Activation Examples
**Quantile 3** (max=81.55, pos=[27, 30, 36, 37])
```
.Lee,etal.“NewSalicidationTechnologywithNi(Pt)AlloyforMOSFETs”,IEEEElectronicDeviceLetters,22[(]12)2[0][0]1.SuchetchantsareincapableofremovingalladditionalelementsespeciallynoblemetalssuchasPt,Pd,RhandReusedalongwithNi.Presenceoftheunreactedmetalonthespacersandtrenchisolationregionsleadstoshortingofthedevicestherebypreventingthemanufacturingofafunctioningsemiconductorchip.Theremainingunreactedmeta...
```

**Quantile 3** (max=73.62, pos=[76, 80, 83, 85, 120])
```
0.1007/s10115-017-1145-y>H.Peng,F.Long,C.Ding,[[Featureselectionbasedonmutualinformation:criteriaofmax-dependency,max-relevance,andmin-redundancy.]{}]{},IEEEtransactionsonpatternanalysisandmachineintelligence27[(]8)[(]2[0]05)1226–38.[](http://dx.doi.org/10.1109/TPAMI.20[0]5.159).
```

**Quantile 2** (max=53.76, pos=[23, 36, 59, 60, 61])
```
butHenry,equippedwiththesameamountofinformation,simplydoesn’tgetit.WhenIstartedwriting[the]GanymedeQuartetbooks,itseemedobvioustomethat[the]storyneededtobetoldfromthemaster’spointofview.Whetherornothe’sactuallyprepared[to][take][responsibility],thefactremainsthatHenry’stheone[in]chargeandhesetsthetone.It’sMartin’[s]jobtoadaptandrespondandaccommodateand[serve][.][Obviously][,][Martin]isbetter-[equi...
```

**Quantile 2** (max=51.71, pos=[50, 53, 54, 55, 56])
```
1968and1975).AsaPBASeniorTourbowler,Daviswonback-to-backtitlesintheUSBCSeniorMasters(1995and1996).Inaddition,Davis[served]theP[BA][in][various][positions]ontheExecutive[Board]andTournamentCommittee.Hewasranked#19onthePBA's2008listof"50GreatestPlayersoftheLast50Years."Forabriefperiod,Davisspenttimein[the]TV[broadcast][booth],alongsideplay-by-playannouncerChrisSchenkel.After[the]death
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.175 |
| score_embedding | 0.4308 |
| score_fuzz | 0.5667 |
| score_detection | 0.6917 |
| explanation_semantic_sim | 0.3935 |

### Position: (0.4555, 0.3768)
### Distances: ngram=3.9888, context=5.4899, noisy=3.0442
### Current: **noisy_activation** (margin: 0.9446)

### Your Tag: _____________

---

## Feature 4705 (diverse: grid_1_3)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6425)
> Names of people, places, and organizations, often proper nouns, and sometimes words or phrases that are part of a formal or official title.

### Activation Examples
**Quantile 3** (max=93.52, pos=[7, 9, 10, 11, 12])
```
first…Finally,myother[Irish]stock[,][Trinity][Biotech][(]TRIB[:]US),actuallymissedthecut.Notexactlyasourceofcomplaintthough–it[’]sduetothecontinuedrallyintheTRIBshareprice.Infact,arecentBarron’sarticlegaveittheoomphthisweektoblowpastmylatestintrinsicvaluetargetof[$]13.41,andcloseup+11%thisweekat$13[.]99.However,ratherunusually,Ialsospecifiedasecondarypricetargetof$16.69whichstillbeckons.Thiswasact...
```

**Quantile 3** (max=92.45, pos=[51, 52, 53, 54, 55])
```
islandsthatcouldbeexploitedforresources,theinformationcouldbeextraordinarilyvaluable.ItsuggestedaplantoearnIdril’sconfidenceandgethertorevealit.Meanwhile,Sub-PatrolmanTomokBiter,theOrcwatchman(whospeaks[with][an][Irish][bro][gue])wassentonpatrolaspartofanewprogramwithareallylong,bureaucraticname,involving“culturaloutreach”orsomesuch.Theprogramwasprimarilyaboutpac[ifying]andeliminatingindividualswh...
```

**Quantile 2** (max=69.45, pos=[4, 13, 14, 16, 17])
```
holdamarketat[Bally]menaoneverySaturday.Hehiredlocal[Irish][as]workers[on][the]estate[;][they]served[as]tenantfarmers[for]much[of][the]nexttwo[centuries][and]more[.][In][1][6][4][1][,][the][local][Bally][mena]garrisonweredefeated[by][Irish]rebels[in][the]battle[of]Bundo[ora][gh][.][Bally]mena'[s][first]markethouse(onthesiteofthepresenttownhall)wasbuiltin16[8]4[.][In][1][6][9][0][,][the]DukeofWürtt...
```

**Quantile 2** (max=68.84, pos=[20, 22, 34, 35, 38])
```
equinoxinsomemodernPagantraditions.KnownasAlbanEilir,meaningLightoftheEarth,[to]modern[Druid]traditions,thisholidayisthesecondofthreespringcelebrations[(][the]midpointbetween[I][mbol][c][and]Belt[ane]),during[which]lightanddarknessareagaininbalance,withlightontherise.Itisatimeofnewbeginningsandoflifeemergingfurtherfromthegripsofwinter[.]Belt[ane][(]MayEve)Traditionally[the]firstday[of]summer[in][I...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.375 |
| score_embedding | 0.72 |
| score_fuzz | 0.5583 |
| score_detection | 0.5917 |
| explanation_semantic_sim | 0.4128 |

### Position: (0.4529, 0.3315)
### Distances: ngram=4.2928, context=5.8663, noisy=4.0496
### Current: **noisy_activation** (margin: 0.2432)

### Your Tag: _____________

---

## Feature 1738 (diverse: grid_1_4)

### Best Explanation (gemini-flash-2.5, Quality: 0.6092)
> brands and modern topics

### Activation Examples
**Quantile 3** (max=54.45, pos=[23, 24, 29, 33, 34])
```
Peters,NorthernIrishOlympian,wasraisedinBallymena.JonathanRea,MBE,motorcycleracerandfive-[time][World]Superbikechampion.BrendanRodgers,[current][Leicester][City][and]formerWatfordF.C.,CelticF.C.,LiverpoolF.C.&SwanseaCityA.F.C.managerJamieSmith,IrishSchools,IrishUniversities,UlsterRugbyandGwentDragonsexRugbyUnionplayer.RaisedinAhoghill.Hasnicknameof"BigAhoghill".NigelWorthington,theformerNorthernIr...
```

**Quantile 3** (max=49.87, pos=[3, 7, 8, 10, 14])
```
Thelatest[EU]PINCreport[highlights][that][1]05G[We][of][new]nucleargenerationwillbeneeded[by][2]0[5]0–roughly100[new]reactors–[to][meet]existingdemandand[climate]changetargets.However,[only]eighteennuclearpowerplantsareindevelopment,planned,orproposed[within][the][European]Unionitself[.][Whereas]ninety-fivereactorsareplanned[throughout][our][EU]neighbours[–][including]Belarus[,][Russia][,]Switzerl...
```

**Quantile 2** (max=39.5, pos=[26, 27, 28, 30, 31])
```
score,I'llattackmoreandbeaggressive,butwiththisteam,[it'sscoring]allthetime,"[Mitchell][said][.]"[CP][3]hasalotofguysthatcangethotandsame[with][this][team][[][at]Cuthbertson].Ijusthavetobealittlemoreaggressivewiththisteam."CuthbertsoncoachMikeHelmsisappreciativeoftheworkethicandleadershipMitchellhasdisplayed."SheltonisthehardestworkingkidI'veevercoached,"Helmssaid."Thekidisbackinthegym.He'stexting...
```

**Quantile 2** (max=37.44, pos=[106, 107, 108, 109, 110])
```
aspossible.Becausedentistsprimarilyworkwiththeirhands,shebelievesthatdentistryisalsoauniqueformofartistry.Whenshe’snotspendingtimepracticingdentistry,Dr.Asinlikestoremainactive,especiallyoutdoors).Fromscubadivingtoskiing,sheparticularlyenjoyshikingandbackpack/campingtrips.AsAZtemperaturessoarinthesummer,shetravelstobeattheheatorpartakesinindooractivitiessuchasyogaorcyclingclasses.Dr.Asin’s#1pastim...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.175 |
| score_embedding | 0.5358 |
| score_fuzz | 0.5083 |
| score_detection | 0.6417 |
| explanation_semantic_sim | 0.3093 |

### Position: (0.4554, 0.4022)
### Distances: ngram=4.0426, context=5.7298, noisy=2.7239
### Current: **noisy_activation** (margin: 1.3187)

### Your Tag: _____________

---

## Feature 13128 (diverse: grid_1_4)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6167)
> Punctuation marks, conjunctions, and prepositions that connect clauses, phrases, or sentences, often indicating a transition or a relationship between ideas.

### Activation Examples
**Quantile 3** (max=94.31, pos=[72, 73, 74, 75, 81])
```
LiverpoolLondonOverseas---------------------------------------------------------------------------------Number5824996265836088611038\%12101312131822[In][total][,]1914[(]40percentof4835)oftherespondentsdeclared[that]theyhadoneormorepostgraduatequalification[.][The]highestproportion(778;16percent)hadanacademicdegree[(]eg,
```

**Quantile 3** (max=88.25, pos=[15, 20, 26, 31, 34])
```
65.4*vs*66.1years),[but]slightlydifferentingender[(]57*vs*49%male[),]dialectgroup[(]45*vs*37%Cantonese)andlevelofeducation[(]69*vs*60%attainingprimaryschooleducationorhigher[).][In][total][,]1[8]0(58%)caseshadcoloncancer[,][and][the]remainingcaseshadeitherrectalorrectosigmoidcancers[.][Table1](#tbl1){ref-type="table"}Table1Selectedcharacteristicsofcolorectalcancercasesandcontrols,theSingaporeChine...
```

**Quantile 2** (max=82.06, pos=[3, 5, 6, 7, 15])
```
-----------Overall[,][3][6][,]504conditionsorcomplaintswere[mentioned][by]3982[respondents]undertakingclinicalwork[.]Conditionsindogsandcatsweremostfrequentlymentioned([Fig2](#VETREC2013101745F2){ref-type="fig"[}).]Skinwasacommonlymentionedbodysystem[,][as]wellasthegastrointestinalandmusculoskeletalsystems([Table4](#VETREC[2]013101745TB4){ref-type="table"[}).]######​[The]sevenmostcommonspeciesandt...
```

**Quantile 2** (max=80.79, pos=[6, 29, 52, 64, 85])
```
16yearsormore[,]requiringRPDswithonetothreemissingteethintheanteriorregionofeithertheupperorlowerarchparticipated[.]Amodifiedsemi-structuredinterviewer-administeredquestionnairewasusedtocollectdataonsociodemographicsandoralhealthvariables[.]Thelevelofsatisfactionwasassessedusingavisualanaloguescale[.]DatawereanalysedusingdescriptiveandmultivariatestatisticsatasignificancelevelofP<0.05[.][The][part...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2305 |
| score_embedding | 0.5025 |
| score_fuzz | 0.525 |
| score_detection | 0.5667 |
| explanation_semantic_sim | 0.3133 |

### Position: (0.456, 0.3864)
### Distances: ngram=3.9974, context=5.2837, noisy=2.8126
### Current: **noisy_activation** (margin: 1.1848)

### Your Tag: _____________

---

## Feature 4304 (diverse: grid_2_0)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.2992)
> Punctuation and special characters, often used to denote code, mathematical expressions, or formatting in text.

### Activation Examples
**Quantile 3** (max=95.86, pos=[4, 5, 6, 7, 8])
```
the-soption[</h2>][</][li]>[</][ul]><ul><[li]>&nbsp;</li></ul><table><tr><tdHEIGHT="100"WIDTH="100"><aHREF="tsld019.htm">Previousslide</a></td><tdHEIGHT="100"WIDTH="100"></td><tdHEIGHT="100"WIDTH="150"><aHREF="tsld001.htm">Backtofirstslide</a></td>
```

**Quantile 3** (max=76.29, pos=[2, 4, 6, 7, 8])
```
01[9]-[0]2[</b>][,][<i>]issue#75[</i>][</][p][>][<h4>]Welcome[</h4>]<[p]>Thisis<i>DejalNews</i>,anoccasionalnewsletterfrom<ahref="/">Dejal</a>.</p><p><i><b>Ifyouwanttoreceivethesenewslettersinyouremailinbox,headovertothe<ahref="/subscribe/">DejalNewssubscribepage</a>tosignup.</b></i></p><h4>TimeOuttips</h4><p>SofarI'vebeenstickingtomygoalofa<ahref="/blog/">Dejalblogpost
```

**Quantile 2** (max=65.72, pos=[3, 4, 5, 6, 7])
```
#74[</i>][</][p][>][<h4>]Welcome[</h4>]<p>Thisis<i>DejalNews</i>,anoccasionalnewsletterfrom<ahref="/">Dejal</a>.</p><p><i><b>Ifyouwanttoreceivethesenewslettersinyouremailinbox,headovertothe<ahref="/subscribe/">DejalNewssubscribepage</a>tosignup.</b></i></p><h4>DejalNewsisback!</h4><p>Thepreviousissueof<i>DejalNews</i>wasabitoverayearago.Ididn'tintendtotakeayearoffpublishingthese
```

**Quantile 2** (max=62.29, pos=[22, 23, 24, 25, 26])
```
amacOSprojectforanotherclient,thatIcan'tmentionyet.Moreaboutthatinthefuture.[</td>][</tr>][</table>][<][p]>Iamcurrentlyfullybookedupforthenextseveralmonthsatleast,butamalwaysinterestedintalkingwithpotentialnewclients.IfyouhaveamacOSoriOSprojectyou'dlikehelpwith(oracustomSimonenhancement),<ahref="/consulting/">checkoutmyconsultingpage</a>formoreinformation[.</][p]><h4>Thankyou[</h4>]<p>Thankyouandw...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.1625 |
| score_fuzz | 0.2833 |
| score_detection | 0.35 |
| explanation_semantic_sim | 0.4925 |

### Position: (0.4641, 0.199)
### Distances: ngram=2.8649, context=3.4527, noisy=5.2749
### Current: **missed_ngram** (margin: 0.5877)

### Your Tag: _____________

---

## Feature 1946 (diverse: grid_2_0)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.3783)
> Abbreviations, acronyms, and special characters, often used in formal or technical contexts, such as scientific or academic writing, and sometimes used in citations or references.

### Activation Examples
**Quantile 3** (max=219.06, pos=[46, 47, 48, 49, 50])
```
1).5.D.SornetteandW.Zhou,[*QuantitativeFinance*]{}[**2**]{},468(2002).6.G.Ehrenstein,[*[International][Journal][of][Modern][Physics]C*]{}[**13**]{},1323(2002).7.D.Farmer,L.Gillemot,F.Lillo,S.MikeandA.Sen,WhatReallyCausesLargePriceChanges?,SFIWorkingPaper,04-02-006,2004
```

**Quantile 3** (max=208.76, pos=[34, 35, 36, 37, 38])
```
Herrera,A.Alonso-Betanzos,[[Fast-mRMR:FastMinimumRedundancyMaximumRelevanceAlgorithmforHigh-DimensionalBigData]{}]{},[International][Journal][of][Intelligent][Systems]32(2)(2017)134–152.[](http://dx.doi.org[/]10[.][1][0][0][2][/]int[.][2]1833).<http://doi.wiley.com/10.1002[/]int.21833>I.Rish,[AnempiricalstudyofthenaiveBayes
```

**Quantile 2** (max=203.84, pos=[21, 22, 23, 59, 61])
```
(1955).21.M.TaylorandH.Allen,[*Journalof[International][Money][and]Finance*]{}[**11**]{},304(1992).22.Y.-H.LuiandD.Mole,[*[Journal]of[International][Money][and]Finance*]{}[**17**]{},535(1998).23.D.SornetteandK.Ide,[*[International][Journal][of][Modern]Ph[ysis][cs][C]*]{}[**14**]{},267(2003).[^
```

**Quantile 2** (max=201.96, pos=[35, 36, 37, 38, 39])
```
andOrganizations*]{}[**49**]{},149(2002).2.T.LuxandM.Marchesi,[*[International][Journal][of][Theoretical][and][Applied]Finance*]{}[**3**]{},675(2000).3.R.ContandJ.-P.Bouchaud,[*MacroeconomicDynamics*]{}[**4**]{},170(2000).4.D.Stauffer,[*[Advances][in][Complex]Systems*]{}[**4**]{},19(200
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4242 |
| score_embedding | 0.3275 |
| score_fuzz | 0.3833 |
| score_detection | 0.3083 |
| explanation_semantic_sim | 0.5037 |

### Position: (0.4984, 0.2162)
### Distances: ngram=3.2547, context=3.3041, noisy=4.9174
### Current: **missed_context** (margin: 0.0494)

### Your Tag: _____________

---

## Feature 13933 (diverse: grid_2_1)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4)
> Verbs, nouns, and adverbs that convey actions, outcomes, or consequences, often in the context of events, decisions, or situations, and sometimes in a formal or official tone.

### Activation Examples
**Quantile 3** (max=73.13, pos=[2, 5, 6, 7, 9])
```
-0[lead]aftertwo[periods][.][His]opponent[broke][the][shutout][with][an][escape][in][the][third][,][but]Turn[mire][would][a][point][of][riding][time][to][claim][a]6[-][1][victory].Afterascorelessfirstperiodat157,redshirtsophomoreNicoO'Dor[found]himself[trailing]afterfiveminutes.[However],after[tying][the][bout][with]an[escape][,][he][secured][a]taked[own][and][held][on][for][a][two]-[point][win][....
```

**Quantile 3** (max=70.31, pos=[11, 12, 13, 14, 20])
```
thethirdstanzabeforeaddingapointofridingtimeto[claim][the][major][decision].JuniorCollinKelly[held]the[lead]afterthefirst[period]atheavyweight[but][was]unable[to][hang][on][.]RedshirtsophomoreCameronLat[hem]was[tied],[2][-][2][,][with]hisfoein[the]third[period][,][but][this][time][the]Bear[cats][got][the][final][taked][own][to][claim][the][win].Aftertrailing[by][as][many][as][seven][points]inhisma...
```

**Quantile 3** (max=61.92, pos=[1, 3, 4, 5, 7])
```
tie[breaking]taked[own][and][was]able[to][claim][a][3][-][2][victory].TheVikings[would][drop]thenexttwo[bouts][but][still][held][the][team][score][lead]halfwaythroughthedual.JuniorChris[Morrow]hadfoughtvaliantlyagainstatop-10opponentat184pounds[,][trailing][by][a][single][point][late][in][the][bout][,][but][his][opponent][held][off][the][upset][bid][.]TruefreshmanBen[Smith][never][trailed]in[colle...
```

**Quantile 2** (max=50.62, pos=[3, 4, 9, 10, 12])
```
-winningdouble[in][the]10th[inning][as]host[Toronto]spoiledMaxScherzer's[bid]tobecomethefirst14-gamewinnerintheAmericanLeague.Danny[Valencia][singled][off]Joba[Chamberlain][to][begin][the][1][0][th],[and]Reim[old]followedwithadouble[to]the[wall]inleft-[center][as][Valencia][scored][without][a][play][.]Scherzerallowedone[run]andfourhitsineightinnings[.]Hewalkednoneandstruckout11,two[shy]ofhisseason...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3077 |
| score_embedding | 0.1975 |
| score_fuzz | 0.4417 |
| score_detection | 0.4167 |
| explanation_semantic_sim | 0.4093 |

### Position: (0.5004, 0.2717)
### Distances: ngram=3.4717, context=3.4858, noisy=3.8407
### Current: **missed_context** (margin: 0.0141)

### Your Tag: _____________

---

## Feature 13013 (diverse: grid_2_1)

### Best Explanation (gemini-flash-2.5, Quality: 0.5533)
> conspiracy and plotting

### Activation Examples
**Quantile 3** (max=134.62, pos=[1, 2, 3, 9, 10])
```
the[instig][ator][.]Attractivepleabargainswereoffered[to][the][conspir][ators][in]exchange[for]future[testimony][in]legalproceedings[related][to][the][crime][.][The]allegation[of][the][husband]['][s][involvement]madeglobalheadlines;ShrienDewani[']ssupportersemphatically[denied][the]accusations,[saying][it][was]["]lud[icrous]"[to][suggest][he][had][solicited][an][attack]onhiswife[from][the][first]t...
```

**Quantile 3** (max=130.37, pos=[34, 36, 38, 39, 40])
```
1.5percent.DDT’sinterviewwiththeconservativeTimecameoutwiththisstrikingcover(right).Someofhisunbalanced(insane?)comments:Evidence[for]President[Obama]’[s][wire][ta][pping][conspiracy]:[“]Ihavearticles[saying]ithappened.”Credibilityinhim:“Thecountrybelievesme.Hey.IwenttoKentuckytwonightsago,wehad25,000peopleinamassivebasketballarena.Therewasn[’]taseat,theyhadtosendawaypeople.”Belief[in][conspiracy]...
```

**Quantile 2** (max=117.32, pos=[6, 7, 8, 10, 11])
```
ordertoavoidprosecution.He[admitted][to][the]detective[that][he]knewtherewas[a]warrantissuedforhisarrestandsaidthathehadbeenusingafalsenametoavoidarrest.Hespecificallysaidthathehadfailedtoappearincourt.Thatismorethansufficient[evidence]tosupporttheconviction.C.SUFFICIENCYOFTHE[EVIDENCE]TO[CON]VICT[ON][THE][CON][SPIR][ACY]CHARGENext,Grantcontendsthat[there][was][insufficient][evidence][to][establis...
```

**Quantile 2** (max=115.61, pos=[3, 4, 7, 8, 17])
```
revengeonCalhoun[.][In]1[8][3]0,reportshademergedwhichaccuratelystated[that][Calhoun][,]whileSecretaryofWar[,][had][favored]censuringJackson[for]his1[8][1]8invasionofFlorida.ThesereportsinfuriatedJackson.CalhounaskedEatontoapproachJackson[about][the]possibility[of]CalhounpublishinghiscorrespondencewithJacksonatthetimeof[the]SeminoleWar.Eatondidnothing[.]ThiscausedCalhoun[to][believe][that][Jackson...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.42 |
| score_fuzz | 0.525 |
| score_detection | 0.575 |
| explanation_semantic_sim | 0.3998 |

### Position: (0.4584, 0.2696)
### Distances: ngram=3.9806, context=5.0665, noisy=4.9295
### Current: **missed_ngram** (margin: 0.9489)

### Your Tag: _____________

---

## Feature 14989 (diverse: grid_2_2)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6942)
> Abbreviated words or prefixes of words, often representing names, titles, or technical terms, typically in formal or technical contexts.

### Activation Examples
**Quantile 3** (max=41.88, pos=[26, 32, 45, 113])
```
imposedandit’scertainlysomethingthatisallowedregardlessofthetypeofconvictionthathasbeenentered.”[¶]50The[mit]timusstatesthatthesentenceimposedwasatermof[prob]ationforsevenyearstolife.B.StandardofReview¶51ThePeoplecontendthatweshouldnotconsiderthisclaimbecauseasentencetoprobationisnotordinarilysubjectto2ThetrialcourtultimatelyorderedTrujillotopay$171,421.97in[res]titution.Trujilloseparatelyappealed...
```

**Quantile 3** (max=40.75, pos=[15, 28, 63, 113])
```
December2013.Histheftconvictionwasrecordedonthe[mit]timusasaclass3felony.[B].StandardofReview¶70ThePeopleassertthat,becauseTrujillodidnotmakethisargumentbeforethetrialcourt,weshouldreviewonlyfor[plain]error.However,thedivisioninPeoplev.Stellabotterejectedthisargument.2016COA106,¶42,P.3d,(notingthat[plain]27errorreviewwasinappropriatebecause
```

**Quantile 2** (max=37.42, pos=[17, 32, 82])
```
orcallalawyer.WhenthisrequestwasdeniedSimpsonsubmittedonthesamedaya[Pen]obscotCountySheriff'sgrievanceformindicatingthathewasapretrial[detaine]eandthathehadarighttousethephonetoarrangebailorcallanattorneywhichwasdeniedbyAssistantJailAdministrator,RichardClukey,whostatedthatitdidnotmeetthecriteriaofadefinedgrievanceanditdidnotpresenta[grie]vableissue.OnanunspecifieddateSimpsonsubmittedarequestforma...
```

**Quantile 2** (max=36.98, pos=[8, 9, 24, 25, 26])
```
andCityofLondonPolice.Certainsenior[non][-]policestaffandseniormembersofnationalpoliceagenciesandcertainotherspecialisedand[non][-][ge]ographicalforcesintheUK,the[Isle]ofManandthe[Channel]Islandswerealsomembers.AsofMarch2010therewere349membersof[AC]PO.Themembershipelecteda[full][-]timePresident,whoheldtheofficeofChiefConstableunderthePoliceReformAct2002.ACPObodiesACPOwasresponsibleforseveralancill...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2333 |
| score_embedding | 0.4658 |
| score_fuzz | 0.5 |
| score_detection | 0.4583 |
| explanation_semantic_sim | 0.3969 |

### Position: (0.4953, 0.3117)
### Distances: ngram=4.2609, context=4.7205, noisy=3.9898
### Current: **noisy_activation** (margin: 0.2711)

### Your Tag: _____________

---

## Feature 15987 (diverse: grid_2_2)

### Best Explanation (gemini-flash-2.5, Quality: 0.4158)
> initialization state indicator

### Activation Examples
**Quantile 3** (max=66.9, pos=[31, 32, 33, 34, 35])
```
DCS.Phone.Views{publicpartialclassServerView:MvxPhonePage,IMvxBindingContextOwner{private[bool][is][Updating][;][private][bool][update][;][private]DcsText[text];[private]DcsInputinput;[private]DcsListlist;[private]DcsButton[button];publicIMvxBindingContextBindingContext{get;set;}publicServerView(){InitializeComponent();BindingContext=newMvxBindingContext();Loaded+=newRoutedEventHandler(MainPage
```

**Quantile 3** (max=65.93, pos=[66, 67, 70, 78, 79])
```
.List;importstaticsun.tools.jconsole.Utilities.*;@SuppressWarnings("serial")classThreadTabextendsTabimplementsActionListener,DocumentListener,ListSelectionListener{PlotterPanelthreadMeter;TimeComboBoxtimeComboBox;JTabbedPanethreadListTabbedPane;DefaultListModel<Long[>][list]Model;JTextFieldfilterTF;[JLabel][message]Label;JSplitPanethreadsSplitPane;[HashMap]<Long,[String][>][name][Cache]=newHashMap...
```

**Quantile 2** (max=59.08, pos=[9, 10, 28, 29, 30])
```
instance);try{this[.][instance].beginFadeIn(deadline);}catch(e){[this][.][dispose]();throwe;}}[finish]Transition[In](){[if][(!][this][.][path]){return;}this[.][title][Card].enter();this[.]instance.finish[Fade]In();}beginTransitionOut(deadline){[if][(!]this[.][path]){return;}this[.]title[Card][.]exit();this[.]instance
```

**Quantile 2** (max=56.93, pos=[0, 1, 11, 12, 14])
```
[._][on]KeyUp=(e)=>{[if][(]document[.][active]Element[.]tagName=="INPUT")return;[if][(]typeofthis[.][key]Bindings[e.code]!=="undefined"){constevent=this.keyBindings[e.code];if[(]typeofevent==="function"){event();}else[{]this.[key][State][event[]][=][false];if[(!][this][.][visual][izer][.][isPlaying][()]&&Object.values(this[.][key]State).every((v)=>!v[))][{]}
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3623 |
| score_embedding | 0.2458 |
| score_fuzz | 0.5 |
| score_detection | 0.4583 |
| explanation_semantic_sim | 0.3836 |

### Position: (0.4947, 0.3009)
### Distances: ngram=3.622, context=3.717, noisy=3.4788
### Current: **noisy_activation** (margin: 0.1432)

### Your Tag: _____________

---

## Feature 13408 (diverse: grid_2_3)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5292)
> Common nouns, names, and pronouns, often referring to people, objects, or entities, and sometimes used in formal or technical contexts.

### Activation Examples
**Quantile 3** (max=59.82, pos=[21, 31, 32, 33, 34])
```
0008463-i03){#FIG3}Afterdiscussionwiththe[patient],itwasdecidedtopursuearesection.[She][was][referred][to]acardiothoracicsurgeonforavideo-assistedthoracoscopicsurgery(VATS)lobectomyprocedure[.]The[patient][underwent]leftlowerlobectomy.Pathologyreportafterlobectomyconfirmedthefeaturesconsistentwithanintralobarsequestration.Discussion==========Pulmonarysequestrationisararecongenitalmalformationofdys...
```

**Quantile 3** (max=59.68, pos=[9, 10, 11, 12, 13])
```
A24-year-old[male][patient][with][a][complaint][of]swellingatthe[wrist]dors[um][of][the]right[hand][was][diagnosed]withaganglioncyst[.][The][patient][was][evaluated][as][ASA][I][class][with][no][remarkable][medical][and][surgical][history][.]After[identifying]theradialnerveunderultrasoundguidance,10millilitersof0.5%bupivacainewasadministered.There[were][no]symptoms[of]sideeffects[during]theblockpr...
```

**Quantile 2** (max=49.84, pos=[25, 26, 30, 31, 32])
```
sequestration,whichisoutsidethenormallungwithitsownvisceralpleura.Here,wepresentacaseofa[4][5]-year-[old][female][who][had][a]diagnosisofintrapulmonarysequestration\[[@REF3]\][.]Casepresentation=================[A][4][5]-year-[old][Caucasian][female][presented][with][a]left-sidedbreast[mass][.]Anexcisionalbiopsyshowedahigh-gradephyllodestumor,[which]wastreatedbyresection.Preoperatively,achestradio...
```

**Quantile 2** (max=49.31, pos=[14, 15, 17, 18, 19])
```
andprivacy.NostaffmemberatMRSwillreleaseanyinformationabout[any][client],[past][or][present],toanyonewithout[the][client]'[s][written][permission].Ifwedohavea[release]of[information]foran[individual][or][an]agency,[which][the][client][can][revoke][at][anytime][and]nofurtherinformationwillbegiventothatindividualoragency.WhatisMethadone?Methadoneisalong-actingsyntheticnarcotic,usedprimarilyinthetrea...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2333 |
| score_embedding | 0.3425 |
| score_fuzz | 0.45 |
| score_detection | 0.45 |
| explanation_semantic_sim | 0.3532 |

### Position: (0.4832, 0.3372)
### Distances: ngram=3.9309, context=4.4862, noisy=3.4742
### Current: **noisy_activation** (margin: 0.4568)

### Your Tag: _____________

---

## Feature 12222 (diverse: grid_2_3)

### Best Explanation (gpt-4o-mini, Quality: 0.5075)
> phrases describing beautiful locations or views

### Activation Examples
**Quantile 3** (max=153.46, pos=[3, 16, 17, 41, 43])
```
28[1]lessthanthree.Theprivate30-acrepark[with][lake],pool,clubhouse,weightroom,pavilion,playground,picnicandbarbecuearea,par3golfcourse,[green]belts[and][unob][structed][views]roundoffthisperfectplacetocallhome.LocalAgentsDanKubinskiTheytoldme,"DanwriteaBio!"....Nowwhowantstotalkaboutthemselves?Wellheregoes:Irememberbeingabout4or5andsittingonabenchinfrontof[a]store[with]myoldersisterKaren.Picturea...
```

**Quantile 3** (max=140.01, pos=[6, 7, 95, 97, 98])
```
visitorsandresidentsalike,is[the][shocking]priceofalcohol.ItisoftenmoreexpensivetogetadrinkinKLthaninnotoriouslyexpensivecitieslikeLondonandNewYork(ander,islandslikeBali).Heftygovernmenttaxesarepartlytoblame,butmanybarsandrestaurantscontributetotheproblembyhavingextremelyhighmark-ups....ReadourfullreviewofHappyhoursandotherwaystogetcheap(er)drinksinKualaLumpur.AsKualaLumpurgrowseverupwards[,]one[o...
```

**Quantile 2** (max=96.06, pos=[52, 53, 54, 55, 57])
```
Thebackframeandfoamcushionaredishedsothatthearmrestsandthedishedorcontouredbacksectioncomfortablycradlethepatientinanatural,relaxedpositiontomaximizepatientcomfortandreducepatientanxiety.Thechairofthepresentinventionprovidesapatient[with][unob][structed][entry]into[or]exitfromthechairinthegenerallyuprightpatiententry/exitpositionand[a][natural],relaxed[and]comfortablesupportinthereclinedpatientand...
```

**Quantile 2** (max=91.23, pos=[0, 3, 39, 40, 41])
```
[beautiful]andexotic[rooms].Shelayeredbrightcolors,luxefabrics,metallicfinishesandexoticshapesatopneutralandnaturalbaseoftextures,adesignlessonwecanalltakeanotefrom.Beautiful[terraces][give][guests][a][chance][to][soak][in][the][views][from][a]luxurious[perch][.]Cavebedroomsareacombinationofrough-hewnwallsthatformacozyroom[with]sumptuouslinens;[the]perfectcombinationfora[great]night’s[sleep][.]Are...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2333 |
| score_embedding | 0.4358 |
| score_fuzz | 0.5 |
| score_detection | 0.5012 |
| explanation_semantic_sim | 0.3497 |

### Position: (0.4715, 0.3564)
### Distances: ngram=3.7682, context=4.6344, noisy=3.0002
### Current: **noisy_activation** (margin: 0.7681)

### Your Tag: _____________

---

## Feature 4911 (diverse: grid_2_4)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5525)
> Common words or phrases in various languages, often used in everyday conversations, articles, or technical discussions, that may include nouns, verbs, adjectives, or adverbs, and sometimes appear in idiomatic expressions or as part of a sentence.

### Activation Examples
**Quantile 3** (max=43.31, pos=[36, 44, 45, 49, 50])
```
endospartes.EJEMPLOvarcounter=10;while(counter>0){console.log(counter);//Leeantesel[valor]variablecounter--;//Después[realiza][operación]}[Esto][sucede][asi][porque][es][como][funciona][interna][mente][lo][que][realiz][as][con][javascript][ya][que][a][pesar][de][que][parece][un][metodo][simple][de][resta][interna][mente][esta][compuesto][de][dos][partes][.][Para][cuando][javascript][hace][la][oper...
```

**Quantile 3** (max=36.06, pos=[2, 3, 7, 10, 11])
```
entu[caso][quieres]restarun[numero]porcada[iter][acion][dentro]detu[ciclo][while][pero][aqui][lo][que][tu][quieres][conseguir][es][que][primero][te][impri][ma][el]9[por][la][lógica][que][encuentras][en][tu][programa][y][aunque][no][es][del][todo][err][ó][nea][eso][no][suceder][á][jam][as][por][la][siguiente][razón][.][En][tu][codigo][lo][que][tienes][es][la][impresion][de][tu][variable][e][impri][...
```

**Quantile 2** (max=34.92, pos=[34, 37, 68, 92, 103])
```
la"impresión"aparecedesdeel10.Séquesiquisieraempezardesde10colocaríaelcontadoren11...peroobviamentetengola[curiosidad]yno[entiendo].varcounter=10;while(counter>0){console.log(counter--);}[resultado]:10987654321[A]:Larazónessimple,enrecursividad[lo][que][haces][es]pasaruna[variable][o][arreglo][en][la][mayor][parte][de][los][caso][para][modificar][los][o][simplemente][imprimir][los][,]
```

**Quantile 2** (max=34.67, pos=[50, 51, 52, 53, 54])
```
counter--|counter=8counter=8|counter--|counter=7...counter=1|counter--|counter=0counter=0|counter--|counter=-1->En[este][caso][ya][no][cump][les][con][la][condición][por][lo][cual][nunca][se][imprime][.][Para][realizar][el][proceso][que][quieres][en][el][caso][de][que][primero][quieras][que][se][impri][ma][el][9][entonces][deber][as][de][hacer][lo][siguiente][:]varcounter=10;while(counter>0){count...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2672 |
| score_embedding | 0.185 |
| score_fuzz | 0.4667 |
| score_detection | 0.4833 |
| explanation_semantic_sim | 0.2554 |

### Position: (0.5001, 0.3849)
### Distances: ngram=4.3282, context=4.5124, noisy=2.9503
### Current: **noisy_activation** (margin: 1.3779)

### Your Tag: _____________

---

## Feature 11653 (diverse: grid_2_4)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5225)
> Function words and short words that serve grammatical purposes, such as prepositions, conjunctions, and articles, as well as some nouns and adjectives that are part of common phrases or idioms.

### Activation Examples
**Quantile 3** (max=32.72, pos=[36, 40, 42, 43, 44])
```
coverimportantdisease-associatedmutationsandinsomeinstancesfailtodetecttheverymutationstheytarget\[[@pone.0152851.ref013]\][.]Basedon[these]considerations[,][we][propose][a][workflow][that][integrates]NGS[as][an][adjunct][diagnostic][modality]forsolidandliquidneoplasms([Fig7](#pone.0152851.g007){ref-type="fig"[}).][The][typical]turn-[around][time][of][the]N[GS][assay][at]thetimeofthestudy[was]arou...
```

**Quantile 3** (max=30.13, pos=[9, 10, 11, 13, 14])
```
superiorsoft-tissueresolutionandmultiplanarimaging[capabilities][and][had]a[significant][impact][on][the][ability]toappropriatelystagelesionsandadequatelyplanforlimb-salvagesurgery.[@b6-rado-46-03-189],[@b7-rado-46-03-189[]][In][contrast][,]multi-slicespiralcomputed[tomography](CT[)][could]providesuperthree-dimensionalmorphologicaldelineationofthediseasedbone[.][Theore][tically],[the][complimentar...
```

**Quantile 2** (max=27.74, pos=[31, 32, 33, 36, 38])
```
2](#tab2){ref-type="table"}).4.Discussion{#sec4}=============InspectionofthetongueinTKM[diagnosis][,][as]wellas[in]western[medicine]\[[@B28]\],[is][one][of][the][most][important][approaches]forobtainingsignificantevidenceindiagnosingthepatient\'shealthconditions\[[@B7]\][.][It][is][used]toobservethecolor,coating,andbodyofthetongue,amongotherfeatures,inrenderingadisease[diagnosis][.][Also],[as]tong...
```

**Quantile 2** (max=27.6, pos=[15, 41, 57, 58, 59])
```
notincludealong-termfollow-upandalargenumberofpatients[,]afurtherstudyisnecessarytodeterminetheeventualeffectofMRIosteotomyplaneonthelong-termsurvivalrate.The[value]ofthree-dimensionalCTinthereconstructionoflimbs----------------------------------------------------------------[There][is][a][huge]varietyinthehumanskeletonstructureastothesizeandshape[.][Therefore],[an]implantneedstobecustom-madetobem...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2344 |
| score_embedding | 0.22 |
| score_fuzz | 0.4167 |
| score_detection | 0.4167 |
| explanation_semantic_sim | 0.2391 |

### Position: (0.5008, 0.3919)
### Distances: ngram=4.2488, context=4.3997, noisy=2.9469
### Current: **noisy_activation** (margin: 1.3019)

### Your Tag: _____________

---

## Feature 14346 (diverse: grid_2_5)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5008)
> Various programming-related tokens, including function names, variable names, and symbols, often used in the context of error handling, function calls, and variable assignments.

### Activation Examples
**Quantile 3** (max=129.63, pos=[3, 4, 5, 6, 7])
```
42[Malta][Con][vo][ys][,]1[9][4]2[Sic][ily][,][1][9][4][3][Falk]landIslands,1982ReferencesCategory:RoyalNavyshipnames<bos>Translations[Muh]sinKhanPickthallYusufAliQuranProjectDoyounotsee[i.e.,know]thattoAllāhprostrateswhoeverisintheheavensandwhoeverisontheearthandthesun,themoon,thestars,themountains,thetrees,themovingcreaturesandmanyofthepeople?Butuponmanythepunishmenthasbeenjustified.AndhewhomAll...
```

**Quantile 3** (max=106.34, pos=[41])
```
whohelpednpower’sownersavoidmillionsintaxisnowontheboardofHMRevenueandCustoms–advisingthetaxman.FormernpowerbossVolkerBeckersranataxavoidanceoperationin[Malta]whichmeantthefirmpaidnoUKcorporationtaxforfouryearswhilebillsroseby55percent.CarolineFlintMP,Labour’sShadowEnergyandClimateChangeSecretary,said:“It’shypocriticalforenergycompanieslikenpowertoblamehouseholdsfor‘wasting’energyandthenlobbytheGo...
```

**Quantile 2** (max=87.5, pos=[27, 28, 37, 70, 71])
```
hermissingfriendGeno.SusyevenputupaFacebookpagewhereallinfo,photosandvideosinrelationtothesearchwasposted[.]Finallyafterweeksofanticipation,Susy[and]Genoreunitedagainwherethetwometupnotonlywitheachotherbutwiththeirloyalandveryenthusiasticsupporters,wavingbannersandplacardsexpressingtheirunwaveringsupport.[Geno][arrived][at][the][activity][center]holdingafreshbouquetforSusy.ItwasawonderfuldayforSus...
```

**Quantile 2** (max=63.83, pos=[85])
```
AJEDREZenPanamáwww.bit.ly/ajedrezenpanama..www.bit.ly/ajedrezpanama2..resultadowww.bit.ly/ajedrezpanamacoleccion#7chessresults.com-Thiswebsiteisforsale!-ChessResourcesandInformation."FinalesyProblemasElementalesdeAjedrez"author"LuisFarru[gia]",recompiledby"JuanRamonMartinezD'Ettore".copyright"EditoradelaNacion,Rep.dePanama,ordenno.1636,1977.
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1498 |
| score_embedding | 0.2725 |
| score_fuzz | 0.525 |
| score_detection | 0.575 |
| explanation_semantic_sim | 0.257 |

### Position: (0.4827, 0.453)
### Distances: ngram=4.2258, context=4.9074, noisy=2.0702
### Current: **noisy_activation** (margin: 2.1556)

### Your Tag: _____________

---

## Feature 9792 (diverse: grid_2_5)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.525)
> Tokens that are part of a larger unit, such as mathematical expressions, programming code, or chemical formulas, often contain special characters and symbols, and may be part of a specific domain or context.

### Activation Examples
**Quantile 3** (max=22.72, pos=[44, 46, 47, 74, 80])
```
mathcal{O}(m^2\cdotn)$,where$m$isthenumberoffeaturesand$n$isthenumberofinstances.ThisquadraticcomplexityinthenumberoffeaturesmakesCFSverysensitivetothe[*]the[curse][of]dimensionality*[@bellman1957dynamic].Therefore,ascalableadaptationoftheoriginalalgorithmisrequiredtobeable[to]applytheCFSalgorithmto[datasets][that][are][large][both]innumberofinstances[and]dimensions.Asaresponsetothebigdataphenomen...
```

**Quantile 3** (max=22.54, pos=[104, 106, 107, 111, 112])
```
.\[sec:results\].WeconcludeinSec.\[sec:conclude\].CMBlensingformalism{#sec:formalism}=====================Tolowestorder,thelensingconvergence($\kappa$)isaweightedprojectionofthethree-dimensionalmatteroverdensity$\delta=\delta\rho/\bar{\rho}$alongthelineofsight,$$\label{eq.kappadef}\kappa(\thetaB)=\int0^{\infty}dzW([z])[\][delta](\chi([z][)\]thetaB,z),[$$]where$\chi(z)$is
```

**Quantile 2** (max=20.26, pos=[19, 20, 25, 76, 77])
```
ADwithbipolarleadsshowednodifferenceinsurvivalat12months(meanfollow‐[up]256[days]forQUAD).[15](#jah32587-bib-0015){ref-type="ref"}Incontrast,aUS‐widestudybasedondatafromdeviceimplantrecordsandtelemonitoringshowedthatCRT‐D[using][QU][AD]wasassociatedwithabettersurvival[than][CRT]‐[D][using]bipolarleads.[13](#jah32587-bib-0013){ref-type="ref"}Observationaldatafrom3centersintheUnitedKingdom
```

**Quantile 2** (max=20.23, pos=[31, 51, 63, 64, 67])
```
determinetheriskofaggressivebehaviour.Inasampleof375infantsandtheirmothers,maternalpsychiatricsymptomswereassessedwiththeBriefSymptomInventoryand[toddler]aggressivebehaviourwiththeChildBehaviourChecklist.Infantheartratewasrecordedat14months.[Maternal]psychiatricproblems,includinghostilityanddepression,wereassociatedwith[toddler][aggressive]behaviour.[Maternal][psychiatric]problemsinteractedwithmea...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2439 |
| score_embedding | 0.3067 |
| score_fuzz | 0.525 |
| score_detection | 0.5667 |
| explanation_semantic_sim | 0.2563 |

### Position: (0.4771, 0.4414)
### Distances: ngram=4.0979, context=4.8614, noisy=2.1597
### Current: **noisy_activation** (margin: 1.9382)

### Your Tag: _____________

---

## Feature 3732 (diverse: grid_2_6)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5725)
> Verbs and verb phrases, often in the form of action words or phrases that describe a change of state, movement, or a specific occurrence, and sometimes function words that introduce or connect clauses.

### Activation Examples
**Quantile 1** (max=15.47, pos=[7, 34, 52, 90, 110])
```
FMbroadcastfromahilltoptower[located]westofthestudiosandAMtransmittersite.EarlyFMprogrammingwasinablockformat,withcontemporaryandcountrymusicinterspersedwithnews[features].KTLO-AM-FMwassoldin1975tofour[new]investorsfor$400,000.Bythemid-1980s,KTLOhadsettledintoamiddle-of-the-roadmusicformat[known]as"Stardust98".The1990ssawownershipandtechnical[changes]forKTLO-FM.The[former]beganwitha$775,
```

**Quantile 1** (max=14.65, pos=[12, 13, 81, 100])
```
85thminutewithatornACL.Hewas[reported][to]likelymiss6–9months.Aftermissingtheentiretyofthe2018MLSseason,Morriswassignedtoafive-yearcontractextensionwiththeSoundersinDecember2018.WerderBrementrialOnJanuary5,2016,itwasreportedthatMorriswas[set]totrainwithWerderBremenattheirwintercamp,whichBremenchiefexecutiveThomasEichin[claimed]was"anopportunityforustogettoknowtheplayerbetter.Nothingmoreandnothingl...
```

**Quantile 2** (max=20.23, pos=[22, 57, 59, 74, 76])
```
eachfoodgroup,whichwereusedtocalculateastandardisedmeanscoreforeachdietarypattern.EFAanalysiswas[conducted]inSASforWindowsV.9.1(SASInstitute,Cary,NC,USA),andeachfactorwasrotatedandcompared(promaxandvarimax)to[identify]and[improve]interpretabilityofeachfactorloading.Parallelanalysesandscreeplotswerealso[used]to[check]fordatainterpretability.Eachofthedietarypatternscoreswasstandardisedto[have]ameano...
```

**Quantile 3** (max=35.35, pos=[20, 26, 27, 34, 40])
```
thatstorieslikethisarehowIcanhelpkeepthesememoriesalive).Growingupinsuburbia[outside]Chattanooga,Ineverheard[much][of]whoweSouthernerswere,[outside]ofmyfather’s[love][of]history.AsChattanoogahasgrownand[finds][itself][as]anup-and-coming[locale]forhipsters,Millennials,and[anyone][wanting]a[taste]oftheNewSouth,Iwonder[if]the[values]theAgrarians[offered]asrebuttalstoMenckenresonatewithfolksthere.Dowe...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.175 |
| score_embedding | 0.3042 |
| score_fuzz | 0.6833 |
| score_detection | 0.6333 |
| explanation_semantic_sim | 0.2586 |

### Position: (0.4935, 0.4948)
### Distances: ngram=4.9539, context=5.1931, noisy=1.9163
### Current: **noisy_activation** (margin: 3.0376)

### Your Tag: _____________

---

## Feature 9374 (diverse: grid_2_6)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6175)
> Punctuation marks, often used to denote citations, references, or quotes, and sometimes single characters or digits that are part of a larger identifier or date.

### Activation Examples
**Quantile 3** (max=87.6, pos=[10, 15])
```
£25millionofbusinessbetweenourmembers.Thisisbecausewe[don]’tjustbelongtoBNIChippingtomakeourownbusinessessuccessful,we'realsotheretoreferbusinesstoeachother.Beingamemberislikehavingasalesteamofoversixtypeoplefindingyounewbusinesseachweek.Ifyouwanttoexperienceameetingforyourselfyou’llfindwealwayswelcomevisitors.Justclickonthe'ComeandVisitUs'sectionformoredetails.<bos>Magneticresonanceimagingofuteri...
```

**Quantile 3** (max=68.62, pos=[21, 31, 56])
```
forthwon'ttalk/dobusinesswithhimotherwise.<bos>WorkingWomen,SpecialProvisionandthe[Debate]onEqualityTherehasbeenconsiderablecoveragein[the]mediarecentlyaboutthepossibilityofofferingwomeninemploymentpaidleavefromworkduringtheirmenstrualperiod.Thishasgeneratedabroad[range]ofresponsesrelatingtolong-standingdiscussionsabout‘equality’and‘difference’:iswomen’sequalitybestachievedbytreatingthemthesameasm...
```

**Quantile 2** (max=46.67, pos=[7, 8, 9, 10, 11])
```
018.SeeTranscriptof[oral][evidence][,][Question][3][4][,][p][.][1][9][.][[]36[]][The]EuropeanCommissionstatisticsprovidethepercentagesoffinesimposedonundertakingspercartelinfringement.Certaincasesmaycompriseseveralinfringementsforwhichmultiplecountingofundertakingsisconsidered.Youcanfindoutmoreaboutwhichcookiesweareusingorswitchthemoffinsettings.PrivacyOverviewThiswebsiteusescookiessothatwecanprov...
```

**Quantile 2** (max=44.68, pos=[20, 23, 24, 29, 41])
```
therearetoofewmembersofstafftobeabletoconductthenecessaryresearchandtocompiletheresponses[".]FromNovember[2]011,[however],FOIrequestscouldbemadetoACPO.ConfidentialIntelligenceUnitInFebruary2009,theMailonSundayhighlightedtheinvolvementofACPOinsettingupthe"ConfidentialIntelligenceUnit"asaspecialisedunittomonitorleft-wingandright-wingpoliticalgroupsthroughouttheUK.CommercialactivitiesTheFebruary2009M...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1803 |
| score_embedding | 0.4008 |
| score_fuzz | 0.6167 |
| score_detection | 0.625 |
| explanation_semantic_sim | 0.2294 |

### Position: (0.483, 0.5136)
### Distances: ngram=4.709, context=5.4702, noisy=1.7306
### Current: **noisy_activation** (margin: 2.9784)

### Your Tag: _____________

---

## Feature 13636 (diverse: grid_3_0)

### Best Explanation (gpt-4o-mini, Quality: 0.31)
>  structured paths or references in programming-related text

### Activation Examples
**Quantile 3** (max=87.67, pos=[1, 2, 4, 6, 8])
```
/[src][/]http[/]ngxhttpcoremodule.c+++b[/]src[/]http[/]ngxhttpcoremodule.c@@-8,6+8,7@@#include<ngxconfig.h>#include[<]ngxcore.h>#include[<]ngxhttp.h>+#include[<]ngxhttpprobe.h>typedefstruct{@@-2431,6+2432,8@@ngxhttpsubrequest(ngxhttprequestt*r,
```

**Quantile 3** (max=84.36, pos=[1, 3, 21, 25, 27])
```
modules[/]bar[/]baz.js')]='beep';files[path.resolve('/foo[/]nodemodules[/]bar[/]package.json')]=JSON.stringify({main:['./]baz.js'});functionopts(basedir){return{basedir:path.resolve(basedir),isFile:function(file,cb){cb(null,Object.prototype[.]hasOwnProperty.call(files,path.resolve(file)));},readFile:function(file,cb){cb(null,files[path
```

**Quantile 2** (max=83.39, pos=[60, 62, 78, 88, 94])
```
distributedundertheLicenseisdistributedonan"ASIS"BASIS,WITHOUTWARRANTIESORCONDITIONSOFANYKIND,eitherexpressorimplied.SeetheLicenseforthespecificlanguagegoverningpermissionsandlimitationsundertheLicense.==============================================================================*/import{Polygon}from'/lib[/]math[/]polygon2d.js';import*asmoduleInterfacefrom'/lib[/]moduleinterface.js';import*[as]mod...
```

**Quantile 2** (max=79.36, pos=[8, 10, 12, 14, 23])
```
script.h\src[/]http[/]ngxhttpupstream.h\-src[/]http[/]ngxhttpupstreamroundrobin.h"+src[/]http[/]ngxhttpupstreamroundrobin.h\+src[/]http[/]ngxhttpprobe.h"HTTPSRCS="src[/][http][/]ngxhttp.c\src[/]http[/]ngxhttpcoremodule.c\@@-593,3+601,8@@NGXGOOGLEPERF
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4122 |
| score_embedding | 0.0792 |
| score_fuzz | 0.425 |
| score_detection | 0.3667 |
| explanation_semantic_sim | 0.5338 |

### Position: (0.5393, 0.2077)
### Distances: ngram=3.6273, context=2.9435, noisy=5.1469
### Current: **missed_context** (margin: 0.6838)

### Your Tag: _____________

---

## Feature 13711 (diverse: grid_3_0)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.3833)
> Special characters, symbols, and formatting markers used in various contexts, including code, mathematical expressions, and document formatting.

### Activation Examples
**Quantile 3** (max=98.35, pos=[11, 12, 13, 14, 15])
```
-arm/proc-armv/processor.h[*][*][Copyright][(][C][)][1][9][9][6][-]1[9]9[9]RussellKing[.][*][*][This][program][is][free][software][;][you][can][redistribute][it]and/ormodify[*][it]underthe[terms][of][the]GNUGeneralPublicLicenseversion2as[*]publishedbytheFreeSoftwareFoundation[.][*][*][Changelog][:][*][2][0][-]09[-]1[9]9[6]RM[K][Created][*]26-09-[1]99[6]RM[K]Added'EXTRATHREADSTRUCT*'
```

**Quantile 3** (max=86.69, pos=[48, 49, 50, 51, 52])
```
producesastringoflength9.Youcouldtryusingtheformat()functioninstead,ifyouareluckyitdoesn'treusethesamecode:format(1.236,'9.2e')<bos>[/*][*][linux][/]fs/super[.][c][*][*][(][C][)]1[9][9][1]Lin[us]Torval[ds][*/][/*][*]super[.][c][contains][code]tohandlethesuper-blocktables[.][*/][#][include][<]linux/config.h>#[include][<]linux/sched.h>#include<linux/kernel.
```

**Quantile 2** (max=77.79, pos=[92, 93, 94, 97, 98])
```
ifIhaveto,forfrequentlyclosingshellsafterI'mdonewithsudowork.A:UsingsudoexcessivelyistheLinuxequivalentoftheoldWindowshabitofrunningeverythingundertheAdministratoraccount.Thatonehasbeendiscussedandcriticizedtohellandback,soyoucanreadeverythingthattalksaboutwhyapersonshouldnotberunningtheirWindowscomputerasanAdministrator,andeverysinglepointwillapplytohabitualuseofsudoonLinux.<bos>[/*][*]TupleType[...
```

**Quantile 2** (max=76.27, pos=[0, 1, 3, 8, 10])
```
[/*]Foundation[,]version2.[1].[*/][/*][*/][/*][It][is][distributed]inthehopethatitwillbeuseful[,][*/][/*][but]WITHOUTANYWARRANTY[;]withouteventheimpliedwarrantyof[*/][/*]MERCHANTABILITYorFITNESSFORAPARTICULAR[PURPOSE][.][See]the[*/][/*]GNULesserGeneralPublicLicenseformore[details][.][*/][/*][*/][/*][See]theGNULesserGeneralPublicLicenseversion2.1[*/][/*]for[more][details][(]en[closed][in]thefilelic...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3681 |
| score_embedding | 0.0675 |
| score_fuzz | 0.45 |
| score_detection | 0.3667 |
| explanation_semantic_sim | 0.5163 |

### Position: (0.5467, 0.2266)
### Distances: ngram=3.9669, context=3.1032, noisy=5.0317
### Current: **missed_context** (margin: 0.8637)

### Your Tag: _____________

---

## Feature 16325 (diverse: grid_3_1)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.53)
> Various nouns and words that are part of technical or scientific terminology, often related to biology, chemistry, or physics, as well as proper nouns and names.

### Activation Examples
**Quantile 3** (max=170.78, pos=[11, 12, 13, 14, 21])
```
90688-Ouyang1],[@[pone][.][0][0]90688-[Bon][net]1],[@[pone].0090688-LeQuesneStabej1].InJapanese,Nakanishietal.showedthat*MYO7A*and*CDH23*mutationsarepresentinUSH1patients[@[pone].[0][0]90688-Nakanishi1],however,thefrequencyisnotyetknown.Inaddition,mutationsinthreecorrespondinggenes(usherin*USH2A*[@pone.0090688-
```

**Quantile 3** (max=169.27, pos=[77, 78, 79, 80, 81])
```
years(outsidethespecialistdomainofeconomiccommentary)hehasbeenmyfavouriteBritishpundit,andoneofthetwoorthreebestIhavecomeacrossanywhere.Rigorous,liberal(intheold-fashionedsense),open-mindedandsurprising.Seewhatyouthink:SothisistobeBrown’sFalklands.VictoryonMountAll-fall-down.[Bon][fire][of][the][bonuses].ServiceinStPaul’s.March-pastbytheRoyalTroopofDerivativesTraders.AnthemtotheBankers’Brigade.Tom...
```

**Quantile 2** (max=150.79, pos=[63, 64])
```
LaureateAmartyaSenwhoseworkinspiredmyaward-winningresearch.Mywritinghasalwaysbeenalaborofloveandajourneyuntoitself.IhavewrittenaboutthehilaritythatensuesonceelectrodesarestuckintoyourmedialventralprefrontalcortexforDiscover,thejoyofpenis-fencingwiththeendangered[bon][obo]forWildlifeConservation,andthe"killer-ape"mythofhumanoriginsfromShakespeare'sTheTempesttoKubrick's2001:ASpaceOdysseyforTimesHigh...
```

**Quantile 2** (max=149.26, pos=[82, 83, 84])
```
theresultingplot.Biologicalfunctionanalysis{#Sec7}----------------------------APANTHEROverrepresentationTest(release20170413)againsttheGOOntologydatabase(release20170926)wasmadeforallproteinsin*I*,usingthe*Synechocystis*referencelistandthe"GObiologicalprocesscomplete"annotationdataset.[Bon][fer][roni]correctionwasappliedformultipletesting,anda*p*valuecut-offof0.05wasusedtofiltertheresults.Proteins...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.2358 |
| score_fuzz | 0.6333 |
| score_detection | 0.5167 |
| explanation_semantic_sim | 0.4403 |

### Position: (0.5087, 0.2559)
### Distances: ngram=4.461, context=4.1604, noisy=5.1079
### Current: **missed_context** (margin: 0.3006)

### Your Tag: _____________

---

## Feature 14132 (diverse: grid_3_1)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5667)
> Code blocks or function bodies, often following a method or function declaration, and sometimes containing conditional statements or loops.

### Activation Examples
**Quantile 3** (max=119.55, pos=[11, 35, 60, 74, 81])
```
typeofviewOrUrlOrId==='string'){varviewId;if(viewEngine.isViewUrl(viewOrUrlOrId)){viewId=viewEngine.convertViewUrlToViewId(viewOrUrlOrId);}else{viewId=viewOrUrlOrId;}if(area){viewId=this.translateViewIdToArea(viewId,area);}if(elementsToSearch){varexisting=findInElements(elementsToSearch,viewId);
```

**Quantile 3** (max=116.28, pos=[3, 4, 35, 88, 123])
```
threads){l.add(t);}Iterator<Long>iterator=l.iterator();while(iterator.hasNext()){longnewThread=iterator.next();Stringname=nameCache.get(newThread);if(doFilter&&name!=null&&name.toLowerCase(Locale.ENGLISH).indexOf(filter)<0){iterator.remove();}}long[]newThreads=threads;if(l.size()<threads.length){newThreads
```

**Quantile 2** (max=107.42, pos=[9, 19, 46, 61, 71])
```
StringplayerId,StringotherId){if(!inGroup(playerId)){returnfalse;}StringotherGroup=ChatSubscriptions.playerGroup(otherId);if(playerGroup(playerId).equals(otherGroup)){returntrue;}else{returnfalse;}}publicstaticbooleanDeductCost(VitalsProxyvitalsProxy,StatusEffectstatusEffect){if(statusEffect.resourceCost==0){returntrue;}
```

**Quantile 2** (max=107.12, pos=[10, 25, 57, 99])
```
;if(obj.getView){view=obj.getView();if(view){returnthis.locateView(view,area,elementsToSearch);}}if(obj.viewUrl){returnthis.locateView(obj.viewUrl,area,elementsToSearch);}varid=system.getModuleId(obj);if(id){returnthis.locateView(this.convertModuleIdToViewId(id),area,elementsToSearch);}
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.875 |
| score_embedding | 0.2533 |
| score_fuzz | 0.6333 |
| score_detection | 0.4917 |
| explanation_semantic_sim | 0.4754 |

### Position: (0.5259, 0.2488)
### Distances: ngram=4.3676, context=3.8293, noisy=5.0267
### Current: **missed_context** (margin: 0.5384)

### Your Tag: _____________

---

## Feature 4 (diverse: grid_3_2)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4092)
> Punctuation and common function words, often marking boundaries between clauses or phrases, and sometimes preceding or following proper nouns or technical terms.

### Activation Examples
**Quantile 3** (max=130.89, pos=[62, 70, 73, 74, 75])
```
ifitexists)andhowwouldyouuselistpropertiesinJava,inJPAand/orinJDO?A:Seemyblogpostexactlyonthis:EfficientKeywordSearchwithRelationIndexEntitiesandObjectifyforGoogleDatastore.IttalksaboutimplementingsearchwithlistpropertiesusingRelationIndex[Entities]andObjectify.Tosummarize[:][Query][<][Document][Keywords][>][query]=ofy.query(DocumentKeywords.class);for(Stringkeyword:keywords){query=query.filter("k...
```

**Quantile 3** (max=106.49, pos=[65, 87])
```
1v3d2-0501.doc>><<File:>a3a1candr.doc>>>Questionstokeepinmind:>*Areourcurrenttimelinesasgoodasitgets?>*DowewanttoadopttheEasternInterconnection'stimelines[?]>*Whatarethedeficienciesofourtimelines?>*Willthesedeficienciesbepresent[under]1.7?>*Whichtimingrequirementscouldbechangedwithanreasonableamount>ofeffort(i.e.,tariffitems,AGCramptimes,A3A1
```

**Quantile 2** (max=92.97, pos=[21, 25, 39, 46, 69])
```
onlytimeIfoundtheserversempty.Betterlucknexttime.Unity4isvastlyimprovedforperformance[.]Thatbeingsaid[,]thereisstillmuchthatcanbedone.Shader1[(]SSAO):Muchimproved[from]before,thoughitishighlysensitivetodynamiclights(theklaxonsforinstance).Inmorestaticlighting[conditions][,]itisonlya20fpsdroporso.Withtheklaxons[,]SSAOgivesmeadropofabout30-40fpsCanwegetsettingsforSSAOqualityandsamples?Shader2(Bright...
```

**Quantile 2** (max=90.07, pos=[27, 31, 32, 36, 41])
```
runningacondensedinterviewwithJonathanStark,discussing,withthebenefitofseveralmonthsofhindsight,theintriguing"Jonathan'sCard"[events]ofthesummer[.]Ifyoudidn[']tpaymuchattention[to]Jonathan's[Card]asitwasunfoldinginrealtime,thisisagoodshortintroduction,withasummary[of]theeventsandsomelinkstofollow-upmaterial.Tuesday,November15,2011Ifyouhaveanyinterestatallinthesoftwareindustry,you'llbeabsolutelyfas...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1642 |
| score_embedding | 0.0825 |
| score_fuzz | 0.4833 |
| score_detection | 0.45 |
| explanation_semantic_sim | 0.3768 |

### Position: (0.5213, 0.3055)
### Distances: ngram=4.1095, context=3.6994, noisy=3.6152
### Current: **noisy_activation** (margin: 0.0842)

### Your Tag: _____________

---

## Feature 2264 (diverse: grid_3_2)

### Best Explanation (gpt-4o-mini, Quality: 0.5933)
> expressions of desire or needs

### Activation Examples
**Quantile 3** (max=73.05, pos=[53, 55, 91, 92, 93])
```
Rick?Youseemdistracted.”IsaidasIbrokefromwatchingHIMtoseewhatwasup.Heshruggedandturnedtowardsme.“Well,IgottoleavehereinafewweeksformyReserveshiftandIhavenowhereforHenrytostaywhile[I]’[m]gone.”RicksighedandIsighedasIwatchedhismusclesflexunderthetightclothing.“He’sagooddog,butmostofmyfriendsjustdon’t[want][the][burden][of][taking][care][of][a][dog][,]evenifitisonlyafewweeksoutoftheyear.”Ithoughtabou...
```

**Quantile 3** (max=70.64, pos=[8, 19, 20, 21, 22])
```
attrialthathehadnotsoughtto[be]transferredfromMagnolia3Dormitorybecausehedid[not][want][to][be][separated]fromRobertShriver.Defendantwasnot[concerned][that]proceduralobstaclesattendanttorequestingthatreliefwouldhaveservedtothwarthisefforts.Fortheforegoingreasons,thisassignmentoferroriswithoutmerit.ASSIGNMENTSOFERRORNUMBERS4AND5:Bymeansoftheseassignments,defendantcontendsthatthetrialcourterredinfai...
```

**Quantile 2** (max=62.8, pos=[14, 15, 42, 43, 45])
```
guyswholoveRose,butshedoesn’tordidn’t[want][them].NotsayingthatBelikovisn’t*cough*wasn’t*cough*agoodguy,butshecan’[t][be]exclusive[with][him][and]thereallyplacesburdenonhershouldersthatsheshouldn’[t][have].However,ifthereisonethingIbelievetobetrue–justbecausesomeoneisgoodtoyoudoesnotmean[you]willbe[happy].I’mhopingthatRosewillbeabletofindsomeonewhocanbeherequalinmost,ifnotallfacetsoftheirlives.Or,...
```

**Quantile 2** (max=62.51, pos=[14, 15, 16, 17, 22])
```
butclaimedthatheandhisbrotherhaddecidedthattheydidnot[want][to][participate][in]Wilson'stransaction[anymore]andhaddecidedtoleave.GrantwasreleasedonbondonMarch26,1993.Fourdayslater,hewasindictedononecountofconspiracytopossesswithintenttodistributecocaineinviolationof21U.S.C.§846.Grantpleadednotguiltyathisarraignment.TheUnitedStatesrequestedashowcausehearingforrevocationofGrant'sbondonthegroundsthat...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.65 |
| score_embedding | 0.3583 |
| score_fuzz | 0.6917 |
| score_detection | 0.5417 |
| explanation_semantic_sim | 0.4558 |

### Position: (0.5099, 0.2916)
### Distances: ngram=4.4531, context=4.2138, noisy=4.2584
### Current: **noisy_activation** (margin: 0.0446)

### Your Tag: _____________

---

## Feature 4336 (diverse: grid_3_3)

### Best Explanation (gemini-flash-2.5, Quality: 0.4567)
> material and containment

### Activation Examples
**Quantile 3** (max=84.29, pos=[24, 25, 30, 34, 35])
```
ContinueReadingBelowCharlesDickens'sPunchRitualFor12to16peopleStep1[:][Three]hoursbeforeyourparty[,]peel3[lemons][with][a][swivel][-]bla[ded][vegetable]pe[eler][,]tryingtoendupwiththreelongspiralsofpeel[.][Put][them][in][a][3][-][or][4][-][quart][fire][proof][bowl][with][3]/[4][cup]demerara[sugar][or][other][raw]sugar[.][Mud][dle]the[peels]and[the][sugar][together][and][let][sit][.]TalkingPoints:O...
```

**Quantile 3** (max=78.38, pos=[1, 2, 3, 4, 7])
```
¾[cup][flour][(][or]asneeded[)]¾[cup][breadcrumbs][(][or]asneeded[)]Peel[potatoes][.]Cut[into][2][-][inch][pieces][and][boil][until][tender];drainuntilpotatoes[are][dry][.][Mash]the[potatoes][and][cool][them][.][Lightly][beat][1][egg][into][the][cooled][potatoes][along][with]herbs,butter,saltandpepperandmixwell[.][Now]youcanbegintoroll[potatoes]toyourdesiredsize[.][Lightly][beat][remaining][eggs][...
```

**Quantile 2** (max=69.21, pos=[34, 40, 43, 44, 45])
```
eyes,symptomsofviralconjunctivitistypicallypresentthemselvesinjustoneeye.Aswithanyvirus,thistypeofpinkeyewilltypicallyrunitscourseandsymptomswillsubside[with]nomedicaltreatmentrequired.[In]additionto[rest][,][applying][a][cold][,][damp][wash][cloth][to][the][eyes][several][times]dailycanhelprelivedtheitchinessandirritationassociatedwithviralconjunctivitis[.]However[,]besurenot[to][share][your][was...
```

**Quantile 2** (max=67.02, pos=[79, 108, 112, 113, 114])
```
successwiththeEBC's.Theyarestartingtowearfasthowever,andInowhaveatleast4brandnewsetsoftheShimano'slayingaround,soIfigureI'lltrythemagainratherthanspendingmoremoney.FranklyIdon'tthinkthat'snecessary.Iwouldsuggestsimplychangingthemoutfornewpadsofwhatevercompoundandthenbreakingthem[in].Wheneveryouchangebrakepads,independentofcompound,youmustbreaktheminagain.ForGod'sSake!DoNOT[sand]yourrotors.[Clean][...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.375 |
| score_embedding | 0.1525 |
| score_fuzz | 0.6167 |
| score_detection | 0.5833 |
| explanation_semantic_sim | 0.3796 |

### Position: (0.5037, 0.3348)
### Distances: ngram=4.2114, context=4.1195, noisy=3.3003
### Current: **noisy_activation** (margin: 0.8192)

### Your Tag: _____________

---

## Feature 5064 (diverse: grid_3_3)

### Best Explanation (gemini-flash-2.5, Quality: 0.4433)
> unheard of or impossible situations

### Activation Examples
**Quantile 3** (max=72.46, pos=[60, 72, 73, 75, 76])
```
byNGSwhenspecimenswithinadequateDNAquantityand/orqualityareexcluded.](pone.0152851.g004){#pone.0152851.g004}Intheremainingspecimens,allmutationsdetectedbythetargeted[assays]werealsodetectedbyNGS.Conversely,NGS[identified][a]number[of][mutations][that]thetargetedtestswerenotdesignedtodetect.For[example],ourtargeted*EGFR*mutationtestonlycoversdeletionsinexon19andtheL858Rmutationinexon21[.]Similarly,...
```

**Quantile 3** (max=71.15, pos=[3, 10, 11, 33, 34])
```
ofmediathat[people]purchase(andkeep,in[media][libraries])withtheirDRM,Ithinkthere'sarealopportunityforestablishingcriticalmindshareandlock-[in][,]ensuring[revenue]and[profit](low-margin,buthighvolume,andalllocked-in).Amazon*has*tosucceedindigital,becausesomuchofthemediatheysellwillbedisplacedbydigitalformats.Quote:Idoubtittoo,butit'shardtocompetewithlossleaders.Yeah,butApplehas[supply]-[chain][mas...
```

**Quantile 2** (max=63.74, pos=[5, 7, 8, 10, 43])
```
demon'swhohas[access]to[knowledge][of]the[individual]micro-statesthatmakeuptheensemblestate,andwhousesittobeatthesecondlaw[@b28].Inthescenarioconsideredherethereisno[knowledge]oftheindividualmicro-statesandtheprocessdoesnotviolatethesecondlaw,onthecontrary,itisderivedfromit.Comparisonwithsingle-shotwork--------------------------------Theprecedingdiscussionconcernedthe*average*workthatcanbedrawnwhe...
```

**Quantile 2** (max=63.37, pos=[18])
```
PaulCayardnotesinthearticle,thewingsonacompetitionsailboathaveafewspecial[constraints]:theAmerica’sCuprulesdon’tallowstoredpower,sotwoofourelevenguys—wethink,two—willbegrindingaprimarywinchalltheracelong.Nottotrim,buttomaintainpressureinthehydraulictanksothatanytimesomeonewantstoopenahydraulicvalvetotrimthewing,therewillbepressuretomakethathappen.Itwillbefascinatingtoseetheseboatsinperson,racingon...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.158 |
| score_embedding | 0.1825 |
| score_fuzz | 0.45 |
| score_detection | 0.35 |
| explanation_semantic_sim | 0.2523 |

### Position: (0.5181, 0.3757)
### Distances: ngram=4.6085, context=4.1245, noisy=3.1102
### Current: **missed_context** (margin: 1.0143)

### Your Tag: _____________

---

## Feature 3461 (diverse: grid_3_4)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5958)
> Punctuation marks and special characters, often used to denote formatting, citations, or mathematical expressions, and sometimes used to separate sections or indicate a break in the text.

### Activation Examples
**Quantile 3** (max=34.15, pos=[32, 39, 81])
```
CellElectricMotorxe2x80x9drelatestoamotorsimilartothatdescribedintheaboveUnitedStatesPatent,whereinthecellisrotating.Besidestheshortcomingofabove[United]StatesPatent,theuseofarotatingcellincreasesthemasstobebalanced.Thus,itismoredifficulttoobtainand,especially,tomaintain.thebalancingoftherotatingpartofthesystem.Thereisaccordinglyaneedforafuelcellpoweredelectricalmotorwhichiswellengineered,sothatth...
```

**Quantile 3** (max=30.54, pos=[32, 51, 61])
```
drivingintegratedcircuitwillbecorrespondingincreasingthenumberofthedrivingintegratedcircuit,andleadingtoincreasecosts,sotheconventionalmethodforimprovingcolorshiftiscostly.[<bos>]IndicatebycheckmarkwhethertheregistrantisanemerginggrowthcompanyasdefinedinRule405oftheSecuritiesActof[1]933(§230.405ofthischapter)orRule12b-2oftheSecuritiesExchangeActof1934(§240.12b-2ofthischapter).Emerginggrowthcompany...
```

**Quantile 2** (max=20.46, pos=[34, 35, 49, 53, 54])
```
.3gplAl),aftersolid-liquidseparation,isthensubjectedtosulfideprecipitation.TheleachliquorispreheatedandthesulfideprecipitationcarriedoutusingH.[sub][.]2Sastheprecipitatingreagentinanautoclaveatabout120[.][degree].C.(250[.]degree[.]F.)andapressureofabout150psig.Intheoriginalschemefortreatingthemixedsulfides,thesulfideprecipitatewaswashedandthickenedtoasolidscontentof65%.Itwasthenoxidizedinanautocla...
```

**Quantile 2** (max=20.42, pos=[33, 66, 97])
```
1990.ViewatPublisher·ViewatGoogleScholarS.M.DudekandM.F.Bear,“Homosynapticlong[-]termdepressioninareaCA1ofhippocampusandeffectsofN-methyl-D-aspartatereceptorblockade,”ProceedingsoftheNationalAcademyofSciencesofthe[United]StatesofAmerica,vol.89,no.10,pp.4363–4367,[1]992.ViewatPublisher·ViewatGoogleScholarM.F.Bear,“Asynapticbasisformemorystorageinthecerebral
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1845 |
| score_embedding | 0.2992 |
| score_fuzz | 0.6333 |
| score_detection | 0.4917 |
| explanation_semantic_sim | 0.3254 |

### Position: (0.5152, 0.385)
### Distances: ngram=4.6671, context=4.3017, noisy=2.7983
### Current: **noisy_activation** (margin: 1.5034)

### Your Tag: _____________

---

## Feature 9506 (diverse: grid_3_4)

### Best Explanation (gemini-flash-2.5, Quality: 0.445)
> connecting clauses

### Activation Examples
**Quantile 3** (max=80.69, pos=[25, 35, 36, 37, 38])
```
somefrequencies,signalstrengthofnoiseissometimesgreaterthanstrengthofasignal,andthefrequenciesareverydifficulttobeidentified[,]whichfinallyresultsinfailureofentiresequenceidentification[;][and][in][addition][,]interferenceintensityoftenchanges[,]detectionreliabilityandsensitivityaredifficulttobeensured[if][only]onefixedsignalstrengththresholdisused[.][2][)]Interferenceinanactualenvironmentoftencha...
```

**Quantile 3** (max=76.67, pos=[39, 43, 49, 65, 81])
```
past20years.Ontheonehand,researchersnotonlybenefitfromknowledgeexchangebutalsosaveonresearchcostsduetothesharingofinformation,technologyandresources([@B33[]).]Ontheother[hand],asresearchgoesdeeper[,]itbecomesincreasinglydifficulttoachieveagreatbreakthroughthroughasinglepersonorinstitution[,]whichforcesresearchersinadolescentmyopiapreventionandcontrolfieldtocooperatewithothers[.][The][above][analys...
```

**Quantile 2** (max=68.33, pos=[17, 19, 33, 34, 63])
```
3~COO)~2~Zn-acceleratedPFresinswashigherthanothersamples[,]indicating[that]atighternetworkandhigherthermalstabilitywaspossessedbytheirmolecularstructure[.][Figure7](#polymers-08-00159-f007){ref-type="fig"}[shows]TG(a)andDTG(b)curvesofthecatalyst-acceleratedPFresins[.]All[of]thePFresinsshowedsimilarthermalstabilityinthefirstthreestagesofthermalevents[.][However],[in]thefinalevent[,]theDTGcurveofthe...
```

**Quantile 2** (max=67.13, pos=[59, 73, 74, 100, 101])
```
phenolicnucleibyformingacarbocationofstrongpositivecharge.Asshownin[Scheme1](#polymers-08-00159-sch001){ref-type="scheme"},themobilityofthepolymerchainwasrestrictedbyion-polymerandion-interaction[,]resultinginahigherthermalstabilityofPFresinthanthecontrolsample[.][Thus],thefirstofdoublepeaksat493°Cmayindicatethebreakageofthemetal-ligandbondingmode[,][and]thesecondpeakofthedoublepeaksat518°Cmayindi...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1939 |
| score_embedding | 0.0408 |
| score_fuzz | 0.675 |
| score_detection | 0.5833 |
| explanation_semantic_sim | 0.2931 |

### Position: (0.5193, 0.3928)
### Distances: ngram=5.1286, context=4.4697, noisy=2.8732
### Current: **noisy_activation** (margin: 1.5965)

### Your Tag: _____________

---

## Feature 12902 (diverse: grid_3_5)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5267)
> Initial letters or short sequences of letters, often representing a person's name, abbreviation, or a word, sometimes used as a prefix or suffix, and occasionally denoting a variable or symbol in a mathematical or technical context.

### Activation Examples
**Quantile 3** (max=40.29, pos=[30, 35])
```
<ahref=\"%5$@\">Pravilaozaštitiprivatnosti</a>te<ahref=\"%6$@\">[Uv]jetapružanja[us]luge</a>kojeprimjenjuje%7$@.<ahref=\"%8$@\">Saznajteviše</a>otomekakosmopotvrdilivašračun.";"comaccountkitconfirmationcodeagreementappprivacypolicyinstantverification"="Dodirnite%1$@zaprihvaćanjeFacebookovih<ahref=\"%2
```

**Quantile 3** (max=40.21, pos=[56, 73, 93])
```
upotrebikolačića</a>.";"comaccountkitconfirmationcodeagreementappprivacypolicy"="Dodirnite%1$@zaprihvaćanjeFacebookovih<ahref=\"%2$@\">[Uv]jeta</a>,<ahref=\"%3$@\">Pravilao[up]otrebipodataka</a>,<ahref=\"%4$@\">pravilao[up]otrebikolačića</a>i<ahref=\"%5$@\">Pravilaozaštitiprivatnosti</a>kojeprimjenjuje
```

**Quantile 2** (max=34.44, pos=[16])
```
problemthatstillistoberesolved.StarsWithTaxProblemsPhotoby[Kevin]Winter/GettyImagesPeteRose,picturedatabooksigningJan.8,2004,inRidgewood,N.J.,spentfivemonthsinjailinthe1990sforfailuretoreportincomehereceivedfromsellingautographsandmemorabilia,andfromhorseracingwinnings.StarsWithTaxProblemsPhotobyPaulHawthorne/GettyImagesHotelmagnateLeonaHelmsley,seenApril27,2004inNewYork,wasconvictedoftaxevasionin...
```

**Quantile 2** (max=31.72, pos=[7, 69])
```
mountainofLiShan.The[Wu]havebeenlivinginisolationfordecades,whilethearrogantShangemperorandhisenchantresshaveruledtheland.IthasbeenaterribletimeforthecommonpeopleandthenobleJibrothers–DanandFa–arekeentobringtheemperor’sreignofterrortoanend.Theyaretolda[Wu]prophecyhaspredictedthefalloftheemperor,butfirsttheymustjourneytoLiShantolearnthetruth.WhentheJibrothersjoinforceswiththeenigmaticHudanandherequ...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2015 |
| score_embedding | 0.3742 |
| score_fuzz | 0.65 |
| score_detection | 0.4833 |
| explanation_semantic_sim | 0.2634 |

### Position: (0.507, 0.452)
### Distances: ngram=4.8566, context=4.5963, noisy=2.2015
### Current: **noisy_activation** (margin: 2.3947)

### Your Tag: _____________

---

## Feature 7411 (diverse: grid_3_5)

### Best Explanation (gpt-4o-mini, Quality: 0.5)
>  familial relationships, particularly focusing on siblings and their roles or titles

### Activation Examples
**Quantile 3** (max=99.57, pos=[36, 37, 38, 40, 74])
```
tohelpthemseethebigpicture,andGod’shandinallofit.AnotefromShannonaboutthisweek’sarticle:AndyPuckettismy[brother][-][in]-[law]andtheAssistantProfessorofAstrophysicsatColumbusStateUniversityinColumbus,GA.AndyisalsoapracticingCatholicandisperhapsmoreexcitedthananyoneelseIknowaboutthe[much][-]anticipatedTotalSolarEclipse,settodazzleusthisMonday.Forthisarticle,OrinandIaskedAndytodoaneclipse-relatedfoll...
```

**Quantile 3** (max=95.51, pos=[43, 82, 83, 84, 86])
```
Dubaiservicesdesigncreativelystyledwallcoverings,thatcarrythepotentialtoenhancethelookandfeelofanambianceTheyalsohelptheestablishmentsofthehospitalitysectorbyfurnishingthemwithadequateTowel&LinenSupplies.<bos>ClinicalScience[-]linkingbasicsciencetodiseasemechanisms.Formorethan50years,ClinicalSciencehasbeenattheinterfacelinkingbasicsciencetodiseasemechanisms.Here,RhianTouyz,the[Editor][-][in]-[Chie...
```

**Quantile 2** (max=86.19, pos=[68, 69, 70])
```
HamletsGhostSpokenlikeatruegliberal.Isupposeyoucondemnblacksbecauseyouhatethemforbeingblack.DaisyThejews,theLobby,andtheirminionsmanufacturephoneydatawithoutmissingabeat.Neithersideoftheconflictyou’recommentingonisinnocentofthis.“Accordingtomy[brother][-][in]-lawfromHolland,theDutchoriginatedtheblackslavetrade.”Ifthatverifiableoristhatjusttheprevailingwhiteself-hatredconfessiontaughtintheschoolsth...
```

**Quantile 2** (max=84.88, pos=[113])
```
loanedR$20milliontotheWorkers'Partywithoutanyguarantororguarantees.TheCPIforthePostOfficebegantoinvestigateloanstotheWorkers’Party.TherewerealsonewclaimsthatmembersorsupportersoftheWorkers'Partyhaduniquecontrolofthebank.7July–Thebank,postal,andtelephonerecordsofRobertoJefferson,DelúbioSoares,JoséGenoínoandJoséDirceuweresubpoenaed.8July-JoséAdalbertoVieiradaSilva,anadvisertodeputyJoséNobreGuimarães...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1744 |
| score_embedding | 0.2583 |
| score_fuzz | 0.5667 |
| score_detection | 0.4833 |
| explanation_semantic_sim | 0.2402 |

### Position: (0.5106, 0.4513)
### Distances: ngram=4.6154, context=4.434, noisy=2.1327
### Current: **noisy_activation** (margin: 2.3013)

### Your Tag: _____________

---

## Feature 14319 (diverse: grid_3_6)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4983)
> Punctuation marks and special characters, often used to denote separation, grouping, or formatting in text, as well as certain function words and short words that serve grammatical purposes.

### Activation Examples
**Quantile 3** (max=118.69, pos=[45, 46, 49, 51, 52])
```
theQueen'sladyinwaitingandexploitedherinnocentdaughter.Youandyourfamilieswillbestrippedofyourstationandpossessions.MartonandVerosus,youshallsufferaquickdeathinthreedaystime.Asfor[Macedonia][,]Ihereby[appoint]Lila[of][Po][tida][ea][as][the][new]governorto[Macedonia][and]aLady[of]thisRealm.As[for][Philipp][i][,]Ihereby[appoint]herMajesty[the][Queen][']sladyinwaiting[,][Sat][rina],asthe[new]governor[...
```

**Quantile 3** (max=108.32, pos=[94, 95, 96, 97, 99])
```
youpreferandbuythistoday.<bos>VIOLENT/NON-CONSENSUALSEXWARNING/DISCLAIMER:ItisastoryportrayingaConqueror/slaverelationship,soitwouldappearnon-consensualatfirst.Asforsexualviolence,therearescenes(Inparts3and4)whicharedetailedandgraphic,andmaynotsuitesomereaders.LordConqueroroftheRealmWrittenbyWarriorJudgePart19Innorthern[Greece][,][in][the]tavern[on]theborder[between][Philipp][i][and][Macedonia][,]...
```

**Quantile 3** (max=66.4, pos=[17, 18, 19, 20, 24])
```
inaldode'Cancellieri,itwasunitedtotheDioceseofBisaccia(the[ancient][Rom][ule][a]),aSam[nite][town][captured][by][the][Romans][in][2][9][5][B].[C].;itappearsfirstasabishopricin1179.Anotherofitsprelates,IgnazioCianti,O.P.(1646),wasdistinguishedforhislearning.In1818itwasincorporatedwiththeSeeofMonteverde,theearliestknownbishopofwhichisMario(1049),andwhichin1531wasunitedtotheArchdioceseof
```

**Quantile 2** (max=63.42, pos=[42, 43, 44, 45, 46])
```
1967),UnitedStatespoliticianLadyofCao,aMochemummy,PeruLongbingCao(born1969),datascientistPlacesCao(state),a[Chinese][vassal][state][of][the]Zhou[Dynasty][(][1]0[4][6][-][2][2][1][BCE])CaoWei,alsocalledWei,oneoftheregimes[that]competedforcontrolofChinaduringtheThreeKingdomsperiod(220-280CE)CaoCounty,Shandong,ChinaOtherusesCão!,analbumbyPortuguesebandOrnatosVioletaCAOsasuna,aSpanish
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1648 |
| score_embedding | 0.2767 |
| score_fuzz | 0.5 |
| score_detection | 0.4 |
| explanation_semantic_sim | 0.1613 |

### Position: (0.5093, 0.4871)
### Distances: ngram=5.0245, context=4.8102, noisy=2.2436
### Current: **missed_context** (margin: 2.5666)

### Your Tag: _____________

---

## Feature 14570 (diverse: grid_4_0)

### Best Explanation (gpt-4o-mini, Quality: 0.3183)
>  technical terms and variables used in programming or formal documentation

### Activation Examples
**Quantile 3** (max=65.19, pos=[71, 77, 79, 92, 100])
```
0cfbcd09","f83a172b-4b07-4ba9-ac68-3ee297828b82"],"createdby":"bb760e2d-d679-4b64[-]b2a9-[0]3[0]05b21870a",["]createdbyid":"[bb]7[6][0][e]2d-d679-4b64-b2a9-0300
```

**Quantile 3** (max=62.2, pos=[21, 38, 61, 69, 72])
```
9,to:0xf92cb},169:{region:[0]x4745,code:0xe4,from:[0]xf5221,to:0xf8f99},170:[{]region:0x47[4]6,[code][:][0][x][5][c],from:0xf9e21,to:0x0},171:{region:0x4746,code:0x60,from:0xf
```

**Quantile 2** (max=57.69, pos=[75, 81, 82, 83, 84])
```
A.&Shore,S.N.2010,A&A,513,L5Casanova,J.,Jose,J.,Garcia-Berro,E.,Calder,A.&Shore,S.N.2011a,A&A,527,A5Casanova,[J].,Jose,J.,[Garcia][-][Ber][ro][,]E.,Shore,S.N.&Calder,A.2011b,Nature10520.Diaz,M.,P.,Williams,R.,E.,Luna
```

**Quantile 2** (max=57.51, pos=[29, 31, 32, 33, 41])
```
{region:0x5553,code:0xf9,from:0xe0021,to[:][0][x][0]},435:[{]region:0x5553,code:0x80fa,from:[0][x][0],to:[0][x]0},436:{region:0x5553,code:0x80fb,from:[0]x0,to:0xfbc61},437:{region:
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.284 |
| score_embedding | 0.0475 |
| score_fuzz | 0.4 |
| score_detection | 0.2917 |
| explanation_semantic_sim | 0.4455 |

### Position: (0.5638, 0.222)
### Distances: ngram=3.9876, context=2.8152, noisy=4.785
### Current: **missed_context** (margin: 1.1724)

### Your Tag: _____________

---

## Feature 7240 (diverse: grid_4_0)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4092)
> Nouns representing abstract concepts, often related to emotions, thoughts, or ideas, and sometimes preceded by prepositions or articles.

### Activation Examples
**Quantile 3** (max=158.86, pos=[31, 32, 33])
```
,ponderingthingsIcan'tpossiblyfix.Whenmykidshaveaproblem,Itakeitpersonally.Bringingthemintothisworldhasleftmewith[a][sense][of]responsibilityI'munabletoignore.Thembeingadultshasnotdiminishedthosefeelings.Iamtoohonest,abitsarcasticandwillcriticizemyselfmorethanyouwillbeabletodo.Iwouldappreciateyounottrying.<bos>Q:Isaone-yield-per-awaitrestrictedpipepossible?I'mworkingwithpipes-4.0.0.Inthatlibrary,t...
```

**Quantile 3** (max=157.5, pos=[90, 91, 92, 93, 94])
```
patienceevenmoreasyourtoddlerlearnstobecomemoreindependent.Forexample,shetellsyoushecan’tfinishthepuzzleshe’sdoing.Insteadofjumpingrightinandtellingherwhichpiecegoeswhere,you’regoingtohavetotellheryou’llhelpalittle.Goaheadandhelp,butletherdoalotofitherself,andmakesureshe’stheonetofinishthejob.Thatwill[give][her][a][sense][of][accomplishment][and][the]confidencetotryagainnexttime.Rememberthatchildr...
```

**Quantile 2** (max=144.55, pos=[125, 126])
```
Theirfree-spiritedpersonalitiesandoverbearingandboorishbehaviorendearthemtoEnidandElaine,butEarlfearsthatheislosingcontrolofhislifeandhisfamily.Overthecourseofonenight,theantagonismbetweenEarlandhisnewneighborsescalatesintosuburbanwarfare.AnalysisBerger'soff-kiltertoneblursthelinebetweenparanoiaandreality,defenseandoffense,actionandintention,allyandadversary.HarryandRamonaseemtoconstantlyundergoch...
```

**Quantile 2** (max=144.11, pos=[16, 17, 18, 20, 21])
```
defeatindefenseofanindefensiblecause,theSouthacquiredanineradicable[sense][of][the]tragic[:][the][awareness]thateventhebestofculturescangoprofoundlywrong,that[seeming]goodcanbebuiltonmassiveevil,thatmanythingsbrokencannotbemended,andthatmuchevilmustpatientlybeendured.InO’Connor’swords,“Wehavehadourfall.”ArguablyuntiltheVietnamWaror9/11,nootherpocketofthecountryknewofsuch.Myquestion:outsideofadecep...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.1067 |
| score_fuzz | 0.6083 |
| score_detection | 0.375 |
| explanation_semantic_sim | 0.5156 |

### Position: (0.5748, 0.2122)
### Distances: ngram=4.7473, context=3.1681, noisy=5.862
### Current: **missed_context** (margin: 1.5793)

### Your Tag: _____________

---

## Feature 5224 (diverse: grid_4_1)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4683)
> Definite articles, possessive pronouns, and certain adjectives often precede nouns, sometimes in formal or technical contexts.

### Activation Examples
**Quantile 3** (max=88.53, pos=[17, 59, 70, 71, 72])
```
implementationresearch.WewilluseaninnovativeonlineiterativepanelprocesscalledExpertLenstocatalogue[the]viewpointsofadiversegroupofresearchersandcommunityresearchleadersworkinginthesescientificfields.WewillusetheseresultstogenerateasetofpreliminaryguidelinesformaintainingRIinresearchthatstrivestoengagediversestakeholders.[The]findingswillhavehighsignificancebecausetheywillimproveour[understanding][...
```

**Quantile 3** (max=83.9, pos=[11, 12, 13, 14, 25])
```
maynotreflectwhatactuallyhappened.Acloserlookat[the][life][and][death]ofJosephSanders,however,mayhelpusunderstand[the][disrupting]impactoftheCivilWaronlifeinJacksonCounty.ScenefromJacksonCounty,Alabama.PhotocourtesyofGaryB.SandersJosephSanderswasbornin1793,inRandolphCounty,NorthCarolina,thesonofJosephandRebeccaSanders.TheelderJoseph,aRevolutionaryWarpatriot,diedin1803andmadeprovisioninhiswillthati...
```

**Quantile 2** (max=72.91, pos=[8, 9, 11, 12, 13])
```
18minutes)looksindetailat[the][thinking]behind[and][the][actual][craft][that]wentinto[the]creationoftheiconictitlesequence.JackColewasanexperienceddirectoroftitlesequencesforUSTVdramainthe1970sandheandHarveBennetttalk[about]howtheytookfootagefrom[the]originalpilotmovieandremouldedittomakethedramaticintrowhichbecameworldfamous.Lookingathowtheyselectedandcombinedimages,[the]layeringofsoundand[the]wa...
```

**Quantile 2** (max=72.78, pos=[33, 97, 105, 118, 119])
```
opportunitiestomakeafastbuckwithsuchtricks.ThenewsagencyRIANovostireportedthatRussianofficialswouldmeetwiththeircounterpartsinBelarusAugust12todiscuss[the]matter.<bos>Microbialsystemsbiology:newfrontiersopentopredictivemicrobiology.ThefieldofSystemsBiologyisarapidlyevolvingareaofresearch.Itfollowsonfromthepreviousexperimentalandtheoretical'omics'revolutioninbiology.Nowthatwehavethroughtheuseofthes...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.0042 |
| score_fuzz | 0.5417 |
| score_detection | 0.3417 |
| explanation_semantic_sim | 0.3063 |

### Position: (0.5651, 0.2477)
### Distances: ngram=5.1908, context=3.6492, noisy=5.3572
### Current: **missed_context** (margin: 1.5415)

### Your Tag: _____________

---

## Feature 101 (diverse: grid_4_1)

### Best Explanation (gemini-flash-2.5, Quality: 0.4467)
> abstract nouns ending in suffixes

### Activation Examples
**Quantile 3** (max=90.56, pos=[24, 47])
```
5{#sec011}------------------------------------------------------------------------------------------BysolvingtheDENV2NS5crystal[structures]intwodifferentglobalconformationsandcharacterizingthefunctionalrelevanceofbothconformations,theworkpresentedherehelpsthe[understandings]oftheconformationaldiversityandconservationinflavivirusNS5,highlightingtheimportantroleoftheMTasemodule,anaturalfusionpartner...
```

**Quantile 3** (max=81.01, pos=[47])
```
Copyingisprohibitedunlesspermissionisgrantedbytheauthor.Allstoriescontainingoffensivelanguageorcontentareclassifiedassuch.Ifyoudonotwanttoseethismaterial,donotchooseanythingintheOffensivecategory.Readatyourown[risks].Youhavebeenwarned.<bos>COURTOFAPPEALSSECONDDISTRICTOFTEXASFORTWORTHNO.02-11-00077-CVINREKEYSAFETYSYSTEMS,RELATORINC.------------ORIGINALPROCEEDING------------MEMORANDUMOPINION1-------...
```

**Quantile 2** (max=71.55, pos=[74, 75, 120, 123, 125])
```
mutantvirusesproducedsimilarIFApositivecellsincomparisonwiththeWTvirus(100%IFApositivecellsobservedat72hposttransfection(hpt));TheK68AandE67A/K68Amutantsshowedonlyaround10%positivecells;theE67DmutantproducedveryfewIFA-positivecells.Virus[productions][were]thenquantifiedbyaplaqueassayatthreetimepoints(48,72,and96h)posttransfection.ConsistentwiththeIFAdata,theE67AandK68Rmutant[RNAs]yieldedsimilar[am...
```

**Quantile 2** (max=71.2, pos=[54, 113])
```
isyourwife.Youthinkthisisextreme?AsItypethisIamliterallyshakingfromreadingthatboy’sstory.Ican’timaginewhatheandhisfamilyhadtogothrough.Aslongasfalserapeaccusationsexist,menneedtofind[ways]ofprotectingthemselvestoo.Evenwhenyouaredatingagirl,bettertohaveachaperone.Ifyouaregoingtomarryher,youwillhaveasmuchsexasyouwant.Ifyouaren’tgoingtomarryherthe“hitandrun”isnotworththe[pains]orpossiblejailtime.Andp...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2333 |
| score_embedding | 0.2033 |
| score_fuzz | 0.5667 |
| score_detection | 0.4 |
| explanation_semantic_sim | 0.5376 |

### Position: (0.5505, 0.2423)
### Distances: ngram=4.1778, context=3.2082, noisy=4.6152
### Current: **missed_context** (margin: 0.9696)

### Your Tag: _____________

---

## Feature 480 (diverse: grid_4_2)

### Best Explanation (gemini-flash-2.5, Quality: 0.3942)
> japanese sayings with character repetition

### Activation Examples
**Quantile 3** (max=56.26, pos=[1, 3, 4, 5, 7])
```
2[0]1[7][.][1]Massage[3][2][.][6]Movingaround[3]2.6Relaxation4740.2Sleep3126.5Vomiting10.9Others10.9\*NSAIDs=non-steroidalanti-inflammatoryagents.Notethatsomerespondentsfilledmorethanoneoption.Thehealthworkers'agesdidnotsignificantlyaffectboththepresenceandtreatmentofheadache(p=0.483and0.293respectively)butsignificantlyaffectedthetypeofheadache(p=0.005)i.e.whetheritwasprimaryor
```

**Quantile 3** (max=47.98, pos=[1, 2])
```
[9][5](59.0%)LymphNode708(11.4%)32(45.7%)Peripheralblood56029(51.8%)Liver364(11.1%)5(13.9%)Skin232(8.7%)5(21.7%)Other22224(10.8%)31(1
```

**Quantile 2** (max=44.37, pos=[1, 2, 3, 4, 5])
```
[1][8][7][.][5]141.7145.8191.7141.7133.3**AlternativeCondition(Glue)**1.4D362.5537.5525.0470.8354.2450.0470.8395.8520.8416.72.4D312
```

**Quantile 2** (max=44.37, pos=[1, 2, 3, 4])
```
[1][0][0][.]0104.291.791.7133.3100.087.52.4D191.7116.783.3112.5125.0108.3108.3158.3104.2120.83.4D179.2129.2
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.241 |
| score_embedding | 0.0383 |
| score_fuzz | 0.5333 |
| score_detection | 0.4333 |
| explanation_semantic_sim | 0.378 |

### Position: (0.5499, 0.2992)
### Distances: ngram=4.3943, context=3.381, noisy=3.7257
### Current: **missed_context** (margin: 0.3446)

### Your Tag: _____________

---

## Feature 5462 (diverse: grid_4_2)

### Best Explanation (gemini-flash-2.5, Quality: 0.5283)
> list separation

### Activation Examples
**Quantile 3** (max=90.46, pos=[31, 42, 43, 47, 48])
```
inthespringof1861theestateswereoncemoreatopenoddswiththeDanishgovernment.TheGermanFederalAssemblynowpreparedforarmedintervention[;]butitwasinnoconditiontocarryoutits[threats][,]andDenmarkdecided[,][on]theadviceofGreatBritain[,]toignoreitandopennegotiationsdirectlywithPrussiaandAustriaasindependentpowers.Thesedemandedtherestorationoftheunionbetweentheduchies[,]a[question]beyondthecompetenceoftheCon...
```

**Quantile 3** (max=89.91, pos=[15, 19, 29, 40, 60])
```
VIIofDenmarkgavehisassenttoalawsettlingthecrownonPrinceChristian[,]princeofDenmark[,]andhismaleheirs.TheprotocolofLondon[,]whileconsecratingtheprincipleoftheintegrityofDenmark[,]stipulatedthattherightsoftheGermanConfederationinHolsteinandLauenburgshouldremainunaffected.Itwas[,][in]fact,acompromise[,][and]leftthefundamentalissuesunsettled.TheGermanFederalAssemblyhadnotbeenrepresentedinLondon[,]andt...
```

**Quantile 2** (max=77.61, pos=[44, 70, 76, 81, 124])
```
FederalAssembly(instructedbyBismarck)threatenedGermanfederalintervention.OnNovember6,1853,FrederickVIIissuedaproclamationabolishingtheDanishconstitutionsofarasitaffectedHolsteinandLauenburg[,]whilekeepingitforDenmarkandSchleswig.Eventhisconcessionviolatedtheprincipleoftheindissolubleunionoftheduchies[,]buttheGermanFederalAssembly[,]fullyoccupiedathome[,]determinedtorefrainfromfurtheractiontilltheD...
```

**Quantile 2** (max=77.33, pos=[5, 6, 43, 50, 67])
```
852;Prussia[,][it]wasincreasinglyclear,aimedattheacquisitionoftheduchies.Thefirststeptowardstherealizationofthislatterambitionwastosecuretherecognitionoftheabsoluteindependenceoftheduchies[,]andthisAustriacouldonlyoppose[at]theriskofforfeitingherwholeinfluenceamongtheGermanstates.Thetwopowers[,]then[,]agreedtodemandthecompletepoliticalindependenceoftheduchiesboundtogetherbycommoninstitutions.Thene...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2333 |
| score_embedding | 0.1633 |
| score_fuzz | 0.875 |
| score_detection | 0.475 |
| explanation_semantic_sim | 0.4776 |

### Position: (0.5715, 0.3028)
### Distances: ngram=5.8011, context=3.7526, noisy=4.2344
### Current: **missed_context** (margin: 0.4818)

### Your Tag: _____________

---

## Feature 2227 (diverse: grid_4_3)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5558)
> Punctuation marks, often used to denote the end of a sentence or to separate items in a list, and sometimes used in conjunction with other symbols to indicate code or mathematical expressions.

### Activation Examples
**Quantile 3** (max=77.27, pos=[60])
```
.Theremaybesomekindofmaterialsscientistouttherewhomayknowaboutsomethinggoingoninthemeso-scalethatIdon'twhomaydisagreewithwhatIjustsaid,butIdon'tthinkso.Allcleaningthemwithalcoholwilldoisremoveoils,dirt,etc[.]IFthepreviouspadmaterialshouldinfactberemovedtooptimizeperformance,alcoholisn'tgoingtodoit.IFthepreviouspadmaterialshouldinfactberemovedtooptimizeperformance,alcoholisn'tgoingtodoit.Therotorha...
```

**Quantile 3** (max=74.54, pos=[41, 113, 119])
```
MexicanPresidentEnriquePeñaNietowon’tbecomingtovisitDDT—PeñaNieto’ssecondcancellationsinceDDT’sinaugurationbecauseDDTwon’tadmitthatMexicowon’tbebuildingthewall[.]MexicanofficialssaidthatDDT“losthistemper”duringthe50-minutetelephonecall;U.S.officialscalledhimfrustratedandexasperated.DHSDirectorKirstjenNielsenhascanceledhervisittoMexico.JaredKushnerwasinchargeofU.S.-Mexicorelationships.Moretocomeabo...
```

**Quantile 2** (max=64.38, pos=[12, 57, 75, 96])
```
militarywork.HehadnotlivedattheByrdApartmentslong[.]Helivedalone.DefendanthadvisitedhimtheSundaybeforethemurderandhadhelpedhimmovetotheapartment.Onthedayofthemurder,defendantcametotheapartmentatabout5:30P.M[.]Dortchownedamotorcyclethathe"usedtostore...rightunderthestairwell[."]DefendantleftDortch'sapartment"around7:30or8:00[."]Hewasgoingtogetsomethingtoeat,somehamburgersforbothofthem;hereturned"be...
```

**Quantile 2** (max=63.6, pos=[62])
```
oflocaldemocracyandparticipationinVenezuelaspecifically,especiallywiththenegativepressthatitgetsintheUnitedStates.Manyviewerswereimpressedwiththedemocraticexperiences,andthefactthatpeopleallacrosstheregionareallparticipatinginsimilarways.OtherswereshockedbecausesolittleofthisishappeningintheU.S[.]Othersfeltthemoviereallyputthingsintoaperspectivethattheyhadrarelyseenorheardofbefore.Thiswasthecaseof...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1433 |
| score_embedding | 0.2933 |
| score_fuzz | 0.7667 |
| score_detection | 0.4167 |
| explanation_semantic_sim | 0.3662 |

### Position: (0.5571, 0.3595)
### Distances: ngram=5.5587, context=4.0616, noisy=3.3962
### Current: **noisy_activation** (margin: 0.6654)

### Your Tag: _____________

---

## Feature 4035 (diverse: grid_4_3)

### Best Explanation (gemini-flash-2.5, Quality: 0.4025)
> spatially varying opti

### Activation Examples
**Quantile 3** (max=98.47, pos=[79, 104])
```
Differenttypesofmodulationcanbeappliedonseveraldelaylines'parametersviatwomultipurposemodulators<bos>ExpressionofacetylcholinesterasemessengerRNAinhumanbrain:aninsituhybridizationstudy.ThedistributionofmessengerRNAcodingforacetylcholinesterasewasstudiedinhumanpostmortembrainandrhesusmonkeybyinsituhybridizationhistochemistryandcomparedtothedistributionofacetylcholinesteraseactivity.[Ac]etylcholines...
```

**Quantile 3** (max=88.44, pos=[96, 98, 99])
```
red,bloodshotappearanceoftheeyes.Ineachcaseofpinkeye,it’simportanttoimmediatelyremovecontactlensesandwearonlyyourglassestolessentheriskofanypossiblecomplications.Andthoughitsoundsscary,conjunctivitisistypicallyeasytotreat;and,withproperawarenessandprecautions,itcanevenbeavoided.Therearethreeprimarytypesofconjunctivitis,andthoughtherearesomesimilarities,eachtypeisverydifferentfromtheother.1.[Aller]...
```

**Quantile 2** (max=80.14, pos=[51, 53, 120])
```
519dexpression([@b21-or-40-06-3392]).Consistentwiththeabovestudy,itwasdemonstratedthatresistinmaypromotedlungadenocarcinomamigrationandinvasionbyincreasingMMP2andMMP9.[Res]is[itin]alsopromotedbreastcancerprogressionviaToll-likereceptor4(TLR4)/nuclearfactor(NF)-κB/signaltransducerandactivatoroftranscription3signaling([@b23-or-40-06-3392]).Recentlyresistinwasreportedtobestronglyexpressedinlungadenoc...
```

**Quantile 2** (max=80.12, pos=[11, 12, 96, 97, 98])
```
).Petitionerarguestwoexclusionsapplytohercancellationof[inde][b]tednessincome:section108(a)(1)(E),whichoffersanexclusionwhenthe-9-[*9]canceleddebtis“qualifiedprincipalresidenceindebtedness”;andsection108(a)(1)(B),whichprovidesanexclusionwherethetaxpayerisinsolvent.Wewillexaminebothexclusionsasappliedtopetitioner.I.QualifiedPrincipalResidence[Ind][eb][ted]ness[Section]108(a)(1)(E)providesthatgrossi...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.1656 |
| score_embedding | 0.1908 |
| score_fuzz | 0.4833 |
| score_detection | 0.2917 |
| explanation_semantic_sim | 0.2824 |

### Position: (0.5501, 0.3347)
### Distances: ngram=4.6193, context=3.4731, noisy=3.3047
### Current: **noisy_activation** (margin: 0.1684)

### Your Tag: _____________

---

## Feature 807 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gemini-flash-2.5, Quality: 0.5008)
> dimensions and quantities

### Activation Examples
**Quantile 3** (max=66.29, pos=[3, 18, 67, 100, 115])
```
seasons,years[and]locales.*D.melanogaster*samplesfromorchardsandvineyardsoften[exceed]10^4^flies[@pgen.1004775-Gravot1],[@pgen.1004775-Bastide1]andthousandsoffliescaneasilybecollectedover[large]compostpiles(Berglandpers.obs.).Therefore,wespeculatethatcensussizeoftemperate*D.melanogaster*populationsatanylocaleisafunctionof[the]localecology(e.g.,amountofwindfallfruit,number[and]sizeofcompostpiles[,]...
```

**Quantile 3** (max=63.11, pos=[8, 39, 41, 42, 51])
```
astereoscope.Mostdataobtainedat[this]stageisqualitative,animportantfirststagetofulleranalysis.Magnificationsofbetweenx10andx50aresufficienttolocatetargetresidues,[describe]features[and][confirm]internalstructuresoftheidentifiedresidues.[High]magnificationModernlight,[high]poweredmicroscopeshave[an]internallightsource,allowingilluminationwithbothtransmittedandreflectedlight.Thesemicroscopescanprovi...
```

**Quantile 2** (max=57.86, pos=[45, 49, 73, 74, 75])
```
,aswellasofphospholipidsintheserum.Anadditionofcholinetotherationspreventedthedevelopmentoflipohepatosis,butfailedtoavertupsetsofthelipidsmetabolism.<bos>TheMayorwalkedthroughthethree[possible]routesandnumerous[possible]futureextensions.HebrokedownhowsuccessfulsystemsincitiessuchasSeattle,Portland,andTacomahavestartedwithroutes[similar][in][length]totheproposedfortheMilwaukeeStreetcarsystem(2to3mi...
```

**Quantile 2** (max=57.51, pos=[41, 52, 53, 54, 55])
```
bynature.Inancienttimes,thereweredepositsofquartz.ButthenoisyriverSanMiguelhasstreamedlotsofpassagesovertheyears.Now,quartzrockshangoverthepondandtheholesof[different]shapesremindthoseseenonthemoon.Dueto[the][different][degrees][of]refractionoflightwaterinsomeplacesseemstobedarkblue,inother-clearandtransparent.Darkbrownandalmostblack,sometimesbluish-grayrocks[vary][in]height[and]shape.Suchmiracleu...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4583 |
| score_embedding | 0.1083 |
| score_fuzz | 0.5167 |
| score_detection | 0.6167 |
| explanation_semantic_sim | 0.3906 |

### Position: (0.4825, 0.302)
### Distances: ngram=3.8674, context=4.4059, noisy=3.8716
### Current: **missed_context** (margin: 0.0042)

### Your Tag: _____________

---

## Feature 10231 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6708)
> Prepositions, often \"by\", used to indicate agency, means, or accompaniment, sometimes in formal or technical contexts.

### Activation Examples
**Quantile 3** (max=165.2, pos=[99, 100, 101])
```
.Asmallertigersharkwasalsointhewaterwithusformuchoftheday,butitwasextremelyskittishandwaschasedawaybythehammerheadwheneveritcameclosetous.Isawitafewtimesoffinthedistance,butitneverventuredcloseenoughformetogetaphoto.Severallargebullsharkswereatthebottom,alongwithacoupleofnicelookinglemonsharks(whichcarryapermanent,sinistersmileontheirfaces).[By][the][end]oftheday,theyweregettingcloseenoughtousforp...
```

**Quantile 3** (max=164.55, pos=[8, 9, 45, 46, 47])
```
,inwhichhetreatsWally–who[for][most]ofthefilmplaysthepartoftheaudience–asthoughheweresomepoorsimpletonwhohasneverhadtheprivilegeofAndre'shippie-dippyenlightenmentcamps.[By][the][third][act],WallyfinallybeginstospeakupandofferssomecriticismsofAndre'sviews;thoughIunderstandthepurposeofthemountingtensionreleasedatthispoint,Wallysimplydidnotofferenoughbiteinhisrepliestobesatisfactory.Inparticular,Iwas...
```

**Quantile 2** (max=155.3, pos=[19, 20])
```
'snotnecessarilythatthey'refillingacanoeupwithboulders,"shesaid.[By][using]OnondagachertthepeopleofGrandIslandwerecontinuingatoolmakingtraditionthatgoesbacktowhenpeoplewerefirstenteringNewYorkState.Forinstance,atasitecalledEmanonPond,locatedinwesternNewYork,peoplewereusingthematerialalmostexclusivelynearly11,000yearsago."Withtheexceptionofasingleprojectilepointmadefromglaciallyderiveddrusyquartz,a...
```

**Quantile 2** (max=155.24, pos=[103, 104, 105])
```
,you’dstillbedirtpoor.Andthefactis,yourancestorswerechildmolesters.WhenididmyDNAandAfricanAmericanresearch,nearlyallofthelittleblackgirlswerearoundtheageof13whentheygavebirthtotheowner’sbabies.Thatmeans,theownersstartedmessingwiththemearlierthan13.Theaverageageofbedwenches(justanexcusetogetasmallchildintheirbeds)wasfrom8to13yearsold.[By][the][end]ofthecivilwar,mostofwhatwastheblackslaves,hadwhitei...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.2558 |
| score_fuzz | 0.8 |
| score_detection | 0.7429 |
| explanation_semantic_sim | 0.465 |

### Position: (0.4926, 0.2892)
### Distances: ngram=5.417, context=5.5703, noisy=5.4117
### Current: **noisy_activation** (margin: 0.0054)

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

## Feature 6833 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gpt-4o-mini, Quality: 0.4517)
> elements related to the Android operating system and its components

### Activation Examples
**Quantile 3** (max=198.18, pos=[110, 111, 112, 118, 119])
```
inanangledposition.<bos>/*#######################################################*Copyright(c)2014JeffMartin*Copyright(c)2015PedroLafuente*Copyright(c)2017-2019GregorSantner**LicensedundertheMITlicense.*Youcangetacopyofthelicensetexthere:*https://opensource.org/licenses/MIT###########################################################*/packageother.writeily.ui;importandroid[.][app][.]Dialog;importand...
```

**Quantile 3** (max=186.03, pos=[27, 28, 36, 37, 38])
```
thylsulfoxide-induceddifferentiation,andthusisnottightlycorrelatedwithcellproliferation.<bos>packagenet.sgoliver.[android][.]controlpers2;importandroid[.][content][.]Context[;]importandroid[.][content][.]res[.]TypedArray;[import]android[.][util][.]AttributeSet[;]importandroid[.][view][.]LayoutInflater;importandroid[.]view[.]View[;]importandroid[.][widget].Button;importandroid[.]widget.EditText;imp...
```

**Quantile 3** (max=181.67, pos=[24, 82])
```
){#sp3.468}<bos>packagetk.woppo.sunday.model;importandroid[.]database.Cursor;importcom.google.gson.Gson;importcom.google.gson.annotations.SerializedName;importjava.util.HashMap;importtk.woppo.sunday.dao.WeatherDataHelper;importtk.woppo.sunday[.]dao.WeatherTodayDataHelper;/***CreatedbyHoon2014/7/4.*/publicclassWeatherTodayModelextendsBaseModel{privatestaticfinalHashMap<String
```

**Quantile 2** (max=181.42, pos=[5, 8, 9, 10, 11])
```
support.annotation.NonNull[;]import[android][.][support][.][v]4[.]app.DialogFragment;importandroid[.][support][.][v]7[.]app.AlertDialog;importandroid[.][text][.]TextUtils[;]importnet.gsantner.markor.R;importnet.gsantner.markor.util.AppSettings;importjava.io.Serializable;publicclassWrConfirmDialogextendsDialogFragment{publicstaticfinalStringFRAGMENTTAG="WrConfirmDialog";privatestaticfinalStringEXTR...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.2275 |
| score_fuzz | 0.5417 |
| score_detection | 0.4917 |
| explanation_semantic_sim | 0.3881 |

### Position: (0.4994, 0.2559)
### Distances: ngram=4.1236, context=4.1191, noisy=4.893
### Current: **missed_context** (margin: 0.0045)

### Your Tag: _____________

---

## Feature 13143 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6075)
> Tokens often represent nouns, proper nouns, or words with specific meanings, sometimes related to formal or technical contexts, and occasionally appear in phrases or sentences with formal or academic tone.

### Activation Examples
**Quantile 3** (max=99.25, pos=[16, 26, 48])
```
attemptsatconvertingthemtoChristianity.Sheservedtimeinprisonlongago.[Stan]-thepastorofasmall,strugglingchurch[.]Hemakesaconcentratedefforttoconvertthefamilyandconsiderstheexpressionoftheirreligiontobeblasphemous[.]HisportrayalofChristianityfrightensthefamilymakinghiseffortsunsuccessful.ReceptionPublishersWeeklycalledthenovel"asharpmeditationonrefugeesanddisplacedpersonsandatragicomedyofculturaldif...
```

**Quantile 3** (max=95.88, pos=[70, 71])
```
alone.Althoughitoftenseemstherearethatmany.TheInternetisfilledwithcommentslikethisone.Timetotakeoffthepaperbag.MBlanc46ItendtoreadrealbooksratherthanInternetsites.Theinformationisverymuchbetter.I’mtalkingaboutthemajorresearchersresearchersofthelastfiftyyearssuchas[Stam][pp],Fogel,andGenovese.Youmention“thousandsofbooksthatdistorttheactualfigure”,butyoudon’tgiveasinglecitation.MikeofAgesTheUnitedSt...
```

**Quantile 2** (max=89.97, pos=[3, 4])
```
5.A[station][was]openedatHarryvilleon24August1878,butclosedon3June1940.TheBallymena,CushendallandRedBayRailwayoperatednarrowgaugerailwayservicesfromBallymenatoParkmorefrom1875to1940.TheBallymenaandLarneRailwaywasanothernarrowgaugerailway.Thelineopenedin1878,butclosedtopassengersin1933andtogoodstrafficin1940.Between1878and1880the
```

**Quantile 2** (max=89.9, pos=[40, 57, 58])
```
ofourPDFandWordtemplates.Justselectexamplestoseewhatwedidwithafewofthemandthentrythemoutforyourself.Youcanalsoprintourfreepdf[stationery]papersandusethemasfreebackgroundscrapbookpapers.PrintableMicrosoftWord[Station][ery]OurMicrosoftWord(MSWord)templatesareperfectforthoseofyouthatliketotypeyourlettersandothercorrespondencedirectlyonyourcomputer.SimplyopenthetemplaterightinsideMicrosoftWord(tm)ormo...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.25 |
| score_fuzz | 0.675 |
| score_detection | 0.7 |
| explanation_semantic_sim | 0.3786 |

### Position: (0.4838, 0.2965)
### Distances: ngram=4.8164, context=5.3006, noisy=4.8199
### Current: **missed_ngram** (margin: 0.0034)

### Your Tag: _____________

---

## Feature 16273 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.695)
> Adverbs and adjectives used to intensify or modify the meaning of a sentence, often expressing degree or extent.

### Activation Examples
**Quantile 3** (max=155.41, pos=[28])
```
,andcreatingmusicwiththekidstomaketheridefunandentertaining,since1998.HiswifeChrissiewroteher[very]firstsongswhenhersonKieranwasbornandcontinuestowritechildren'ssongs,eventhoughKieranisnowagrumpyteen-ager.Foroversevenyearstheydreamedofmakingachildren'sCDtogether.Therecordingbecamearealityin2016afterasuccessfulcrowdsourcingcampaign.Theyarethrilledtobesharingthesesongswiththeworld,tothedelightofchil...
```

**Quantile 3** (max=152.75, pos=[12])
```
andconfidentstyle.RacetothefinishAtour[very]ownstandwehosteddelegateswholinedupagainsteachotheronourracingsimulator.Thingswerecompetitivethroughthedaybutourclearwinner(ifnotofanactualrace)wasPeterWhiteoftheFBAA!GaladinnerandawardsFestivitiesatMovieWorldarealwaysfunandthe2016editiondidn’tdisappoint.Cappingoffagreatevening,bigcongratulationstothewinnersofthe2016FBAAawards:ThankstotheFBAAforputtingon...
```

**Quantile 2** (max=146.85, pos=[15])
```
10semesteratlarge.IthinkI’llpostsomethingforthe[very]endoftheyearaswell.ButIdigress.Withoutfurtherado–mayIpresentRichelleMead’sShadowKiss.“Suddenly,theburnofthatblackmagicvanishedfromthebond,alongwiththatsickeningsensation.Somethinghitmelikeablastofwindintheface,andIstaggeredbackwardIshudderedasaweirdsensationtwistedmystomach.Itwaslikesparks,likeacoilofelectricityburningwithinme”(340).Probablymyfa...
```

**Quantile 2** (max=146.69, pos=[16])
```
3.2Honeycomboutofthebox.Ofcourse,Samsung's[very]ownTouchWizinterfacewillbeinstalledontopofitalongwithabunchofhandyappsprovidedbythecompany,namelySocialHub,ReadersHub,andMusicHub.Lastbutnotleast,thetabletwillbeequippedwitha21MbpsHSPA+radiomeaningthatyouwillbeabletostayconnectedtothewebevenwhenonthemove.AlthoughfolksinIndonesiaandAustriawillbethefirstonestogetatasteoftheSamsungGALAXYTab7.0Plus,which...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.3992 |
| score_fuzz | 0.8667 |
| score_detection | 0.7167 |
| explanation_semantic_sim | 0.5314 |

### Position: (0.5009, 0.2895)
### Distances: ngram=5.7418, context=5.7134, noisy=5.7118
### Current: **missed_ngram** (margin: 0.0017)

### Your Tag: _____________

---

## Feature 4992 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.5275)
> concept of reality

### Activation Examples
**Quantile 3** (max=94.84, pos=[6, 17, 18, 19, 20])
```
partycandidates,”TomHaydenpointed[out]inarecentarticle.“Democratshavetoswallow[hard][and][accept][the]rightoftheGreenPartyandRalphNadertoexistandcompete.”Atthesame[time],[Hayden][added][cog][ently],“NaderandtheGreens[need][a][reality][check][.][The]notionthatthetwomajorpartiesaresomehowidenticalmaybearationaleforbuildingathirdparty,[but][it][insults][the][intelligence][of]millions[of]blacks,Latino...
```

**Quantile 3** (max=88.28, pos=[35, 36, 37, 38, 39])
```
hand,butinsistthatpeopleabidebyselectteachingsfromyourholybook(whicheveritmaybe)ontheother.OnHealthcare.Beingaconservativeusedto[mean][being][a][realist][,][dealing][with][the][world][as][it][is][and][hopefully][proposing][pragmatic][,][typically]non-[radical][solutions].One[of][the][persistent]problemswiththeUShealthcaresystemisthe“freerider”problem.Hospitalsarerequiredtotreatandcareforanypatient...
```

**Quantile 2** (max=68.66, pos=[36, 37, 40, 41, 44])
```
&seasonsafewyearsago;whichmeansthati’mnotparticularlyinterestedintalkingaboutwhetheramormonshouldmarryanon-mormoninthefirstplace.the[reality][is]thatit[happens][.]instead,[i]’[m]interested[in]ideasabouthowtogoaboutbuildingastrong,interfaithfamily(notjustamormonoraquakerfamilywithoneparentwhobelievesdifferently).Sharethis:RelatedAmeliahasrecentlyrelocatedtoSaltLakeCityforhernewjobsellingcollegetext...
```

**Quantile 2** (max=66.11, pos=[28, 29, 30, 31, 38])
```
awell-coveredtopic.However,itmaybeaconceptthatweneedtoremindourselvesof,andonaregularbasis.The[reality][of][my][daughter]andIsittinginthatliving[room]that[day][was]thatherillnesswaslikelyamuchbiggerthreattoherthanmysimmeringanxietywastome[.]Infact,bythispointifyou’vereadorlistenedtoenoughmaterialfromthisverywebsite,youknowanxietysymptomsaren’tdangerousatall.Yet,thereIwasdoingmybestto[accept]andflo...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.3042 |
| score_fuzz | 0.5917 |
| score_detection | 0.6583 |
| explanation_semantic_sim | 0.4318 |

### Position: (0.4647, 0.3131)
### Distances: ngram=3.8596, context=4.806, noisy=3.8626
### Current: **missed_ngram** (margin: 0.0029)

### Your Tag: _____________

---

## Feature 13380 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.3775)
> variable assignments and string endings

### Activation Examples
**Quantile 3** (max=111.68, pos=[1, 2, 4, 5, 6])
```
`[SET][`]searched[`][=][:][searched][+][1][WHERE]`search`.`[id][`][=][:][user][id][;");][$][add][search][->][bindValue][(':]user[id][',][$][v]bulletin->userinfo['userid['],][PDO][::][PARAM][INT][);][$]addsearch[->][bindValue][(':]searched[',][$][result]['[searched]['],]PDO[::][PARAM][STR][);][$]add[search][->][execute][();]/*pageiwanttoexecuteifuserhasnoreachedlimit*/A:Youmightbetterhave[a]columnw...
```

**Quantile 3** (max=104.59, pos=[82, 83, 84, 85, 86])
```
inesisrecorder/KinesisFirehoseRecorder.html).<bos>Q:ComopassarobjetosentrecontrollersnoMVCutilizandoPOOBasicamente,euprecisoqueserologinforbemsucedidosalvaronomedeusuárioemumavariáveleutilizar-láemoutrocontroller.Model.php:publicfunctionlogin($email,$password){sessionstart();$[sql][=]["][SELECT][*][FROM][users][WHERE][email][=][:][email][AND][password][=][:][password][;";][$][query][=][$][this][->...
```

**Quantile 3** (max=88.49, pos=[3, 4, 6, 10, 11])
```
':password'[=>][$]password[);]$[query][->][execute][($][parameters][);][$][rows][=][$][query][->][fetch][(][PDO][::][FETCH][NUM][);][if][($][rows][>][0][)][{]header("[Location]:"[.]URL."home");}[else][{]exit('Emailorpasswordincorrect');}}Controller.phppublicfunctionlogin[()]{if(isset($_POST['loginsubmit'])ANDisset($_POST['email'])ANDisset[($_][POST]['password']))[{][$]this[->][model][->][login][($...
```

**Quantile 2** (max=84.64, pos=[2, 3, 4, 6, 7])
```
.execute[("][INSERT][INTO]tennis[("][+][column][+][")][VALUES][(?)][",][(][str][(]entry[),][))]conn[.]commit()#[The]realfunctionwillhavetobe"updating"[def][update][(]player,[column][,][entry][):][c][.][execute][('][SELECT][*][FROM][tennis][')]c[.][execute][("][UPDATE][tennis][SET]["][+][column][+]["][=]["][+][str][(][entry][)][+]["][WHERE][player][=]'"[+]player+["'][")]conn[.]commit()[def]readfrom...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3699 |
| score_embedding | 0.1333 |
| score_fuzz | 0.475 |
| score_detection | 0.475 |
| explanation_semantic_sim | 0.5353 |

### Position: (0.5016, 0.2316)
### Distances: ngram=3.5053, context=3.5019, noisy=4.7614
### Current: **missed_ngram** (margin: 0.0034)

### Your Tag: _____________

---

## Feature 12866 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gemini-flash-2.5, Quality: 0.55)
> numeric identifiers

### Activation Examples
**Quantile 3** (max=112.39, pos=[3, 4, 5, 6, 7])
```
113[9][9][2][4][8][0][1][>]M.Lichman,[[UCIMachineLearningRepository]{}](http://archive.ics.uci.edu/ml)(2013).<http://archive.ics.uci.edu/ml>J.Ma,L.K.Saul,S.Savage,G.M.Voelker,[IdentifyingSuspiciousURLs:AnApplicationofLarge-ScaleOnlineLearning]{},in:ProceedingsoftheInternationalConferenceonMachineLearning(ICML),Montreal,Quebec,2009.R.
```

**Quantile 3** (max=109.71, pos=[3, 4, 5, 6, 7])
```
102[2][6][8][9][9][0][0][4][7][0][).]J.Bacardit,P.Widera,A.M[á]{}rquez-chamorro,F.Divina,J.S.Aguilar-Ruiz,N.Krasnogor,[Contactmappredictionusingalarge-scaleensembleofrulesetsandthefusionofmultiplepredictedstructuralfeatures]{},Bioinformatics28(19)(2012)2441–2448.[](http://dx.doi.org/10.
```

**Quantile 2** (max=94.83, pos=[3, 4, 5, 6, 7])
```
716[2][8][7][8][8][2][7][$\]${p0(pc)=p3(pc)}$&$0.278[0][6][6][1][4][3][2][8]$&$0.28488[9][0][8][0][0][0]$\${p2(pc)}$&$0.1479559[0][4][4][8]$&$0.14[3]4072[8][0][0][0]$\--------------------------------------------------[----------------]--------------------------------[----------------][----------------][----------------][-------]--------------------------
```

**Quantile 2** (max=93.47, pos=[18, 19, 20, 21, 22])
```
():quality(40)/discogs-images/A-12113[3][-][1][2][6][2][7][8][6][6][6][0][.]jpeg[.]jpg","title":"SavageRepublic","uri":"/artist/12113[3]-Savage-Republic","resourceurl":"https://api.discogs.com/artists/12113[3]","type":"artist","id":12113[3]},{"thumb":"https://api-img.discogs.com[/]GYkPyAYZE[c][FM]0bzyjn[B]ple7P3Yw=/15
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2266 |
| score_embedding | 0.4317 |
| score_fuzz | 0.5583 |
| score_detection | 0.5417 |
| explanation_semantic_sim | 0.4729 |

### Position: (0.4687, 0.3068)
### Distances: ngram=3.7774, context=4.5757, noisy=3.7719
### Current: **missed_ngram** (margin: 0.0055)

### Your Tag: _____________

---

## Feature 7637 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5875)
> Various nouns and adjectives representing concepts, objects, and ideas, often in specific contexts such as science, history, and everyday life.

### Activation Examples
**Quantile 3** (max=140.6, pos=[26, 27, 28])
```
https://www.mirror.co.uk/news/real-life-stories/a-cup-of-tea-[sol][ves][-]everything-505302Thankyou,Halforsuchagreatrecommendationformybook.Idohavetosay…readingmybookwillnotreduceyourriskofanyhealthproblems,butitwillincreaseyourriskofwantingtoreadbooktwo,Legacy’sPath,comingverysoon.<bos>202F.2d530WOODWORKERSTOOLWORKSv.BYRNE.No.13236.
```

**Quantile 3** (max=139.49, pos=[22, 27, 68, 74, 112])
```
350.degree.F.)andapressureofabout700psig.The[solution]containingnickelandcobalt[was]thenneutralizedwithammoniatoapH(5.35)sufficienttoprecipitateanyresidualiron,aluminum,andchromiumpresentusingairasanoxidizingagent.Theprecipitatewasthereafterseparatedfromthe[solution]andthenickelandcobalt[solution]thenadjustedtoapHofabout1.5.H.sub.2Swasaddedtoprecipitateselectivelyanycopper,leadandzincpresent.Thepr...
```

**Quantile 2** (max=129.28, pos=[1, 2, 3, 35])
```
s[ols][tices][and]equinoxes)andthemidpointsbetweenthem.Whilenamesforeachfestivalvaryamongdiversepagantraditions,syncretictreatmentsoftenrefertothefour[solar]eventsas"quarterdays"andthefourmidpointeventsas"cross-quarterdays",particularlyinWicca.DifferingsectsofmodernPaganismalsovaryregardingtheprecisetimingofeachcelebration,basedondistinctionssuchaslunarphaseandgeographichemisphere.Observingthecycl...
```

**Quantile 2** (max=129.14, pos=[1])
```
-[sol]asJinJoo-ahLeeSoo-jinasSungAh-miParkYoon-jaeasOhJin-ahmKimHo-changasYooTae-youngMichaelBlunckasKyleShinGooasMasterJoong-bongJunSung-hwanasMasterJung-doLeeHyo-jungasMaYi-joon(CEOJoonEntertainment)TheMidasKimJoon-hyungasDo-sukSonGa-youngasChoiYoung-mimWonJong-ryeasYoung-nim'smotherKimSun-ilasMin-jaeMinJoon-
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.1325 |
| score_fuzz | 0.6917 |
| score_detection | 0.675 |
| explanation_semantic_sim | 0.4953 |

### Position: (0.4995, 0.2645)
### Distances: ngram=4.878, context=4.8808, noisy=5.522
### Current: **missed_ngram** (margin: 0.0028)

### Your Tag: _____________

---

## Feature 10331 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4917)
> Various parts of speech including nouns, adjectives, adverbs, and determiners, often functioning as integral components of phrases or clauses, and sometimes indicating possession, negation, or relationships between entities.

### Activation Examples
**Quantile 3** (max=137.99, pos=[5, 6, 7, 8, 9])
```
RecordsOfficeTheAC[PO][Criminal][Records][Office][(][AC][RO][)]wassetup[in]2[0][0]6inresponse[to][a]perceivedgap[in][the][police]service['][s]ability[to][manage][criminal][records][and]in[particular][to][improve][links][to][biometric][data].TheinitialaimofACROwas[to][provide][operational]support[relating][to][criminal][records][and][associated][biometric][data],[including][DNA][and][fingerprint][r...
```

**Quantile 3** (max=132.37, pos=[33, 105, 107, 110, 111])
```
saidthatRepublicanshadtokeeptheirHousemajoritytoprotectDDTfromMueller.Sen.JeffMerkley(D-OR)releasedaJanuary201[7]DHSplanfromawhistleblowerconnectingseparationofmigrantchildrenfromtheirparentsasadeterrenttocrossingtheU.S.-Mexicoborderwhenthenumberwasatanall-timelow.Thousandsmoremigrantchildrenwereseparatedfromtheirparentsthanreported,andDHShadnoplansforreunification.DHSrecommendeddenyingmigrantchil...
```

**Quantile 2** (max=113.92, pos=[64, 75, 76, 77, 78])
```
el,x,data){this.expandAll();}")})})A:jsonedit(x,mode='view')%>%onRender("function(el,x,data){this.editor.expandAll();}")<bos>ApplyingforPassport[and]Visa?Here’swhatyouneedtoknow[about][Police][Clearance][Certificate]Applying[for]PassportandVisa?Here’s[what]you[need][to]know[about][Police][Clearance]Certificate[For]thebeginners,applyingfor[a]newidentificationormaking[a]tripabroadofferascend[to]many...
```

**Quantile 2** (max=101.27, pos=[4, 7, 9, 10, 11])
```
anyofthefollowing[penalties]mayapply[:][Non][Conv][iction][Order][This][means][that][you][are][guilty][but][the][court][does][not][impose][a][criminal][conviction][upon][you][.][The][court][will][look][a]range[of]matterswhendeciding[whether][to][grant][a][‘][section][1][0][dismissal][or][conditional][release]order[’]–[including][the][incident]itself[,][the][lead][-]uptotheincident[,][your][general...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2414 |
| score_embedding | 0.4908 |
| score_fuzz | 0.3667 |
| score_detection | 0.425 |
| explanation_semantic_sim | 0.3292 |

### Position: (0.4526, 0.324)
### Distances: ngram=3.5317, context=4.8393, noisy=3.536
### Current: **missed_ngram** (margin: 0.0043)

### Your Tag: _____________

---

## Feature 12376 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.3825)
> math equations and function variables

### Activation Examples
**Quantile 3** (max=115.53, pos=[2, 3, 7, 8, 13])
```
{g[(][t])}}{2\[sqrt][{]Tn}}[dW]t[,\][quad][t][\][in]I\[setminus][[][0][,\][varepsilon]m].$$Letusdenoteby$\barYj$theincrementsoftheprocess$(\bary[t])$[over][the]intervals[$]Jj$,$j=2,\dots,m$,i.e.$$\barYj:=\bar[y][{]vj}-\bar[y][{]v{j-1}}\sim{\ensuremath{\mathscr{Nn}}}\[bigg][(\][int][{]Jj}\[sqrt]{[f][(][y])}\nu[0][(][dy][),\][frac][{\]
```

**Quantile 3** (max=108.86, pos=[4, 6, 7, 8, 10])
```
)+\frac{1[}{]2[\][sqrt][{]Tn}}\[sum][{]j[=]2[}^]m\[sqrt][{\]nu0[(]Jj)}B[j][(][t]),\[quad][t][\][in]I\[setminus][[][0][,\][varepsilon]m[],]$$wherethe$(Bj[(]t))$areindependentcenteredGaussianprocessesindependentof$([W][t])$andwith[variances][$]$\textnormal{Var[}(][B][j][(][t][))=\][int][{\][varepsilon][m][}^][t][V][j][(][y][)\]nu0[(][dy][)-\]bigg[(\][int][{\]varepsilon[m][}^]tV[j][(]y)\nu0[(]dy
```

**Quantile 2** (max=103.76, pos=[8, 10, 11, 12, 24])
```
f)$denotestheFouriertransformofthe[function]$[f][(][t])$.Thus,analyticalFouriermethodsusuallyusedintheclassical[integer]casecanbeextended[to][the][fractional][case][@Ma10].ThefractionalB-splinesandtheirfractionalderivatives.{#sec:fractBspline}==========================================================The[*fractionalB-splines*]{},[*i.e.*]{}theB-splines[of][fractional][degree],wereintroducedin[@UB00]...
```

**Quantile 2** (max=103.66, pos=[7, 30, 33, 37, 38])
```
1}{k}\Big),\[quad]k=1,\dots,m-2.$$OnemaycomputethefollowingTaylorexpansions:$$\[begin]{aligned[}]\[int][{][x]{m-k-[1][}^][*][}^{]x{m-k}^[*}]{\ensuremath{\accentset{\triangle}{V[}}][}_{]m[-][k][}(][x][)]\[nu][0][(][dx])[&=]\frac[{]1[}{]2}[-][\][frac][{]1[}{][6]k[}]+\frac{5}{24k^2}+[O][\][Big][(\][frac][{][1][}{]k^[3]}\Big);\\
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.5767 |
| score_embedding | 0.3008 |
| score_fuzz | 0.45 |
| score_detection | 0.375 |
| explanation_semantic_sim | 0.5691 |

### Position: (0.4994, 0.2067)
### Distances: ngram=3.3404, context=3.3423, noisy=5.3045
### Current: **missed_ngram** (margin: 0.0019)

### Your Tag: _____________

---

## Feature 5407 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.6392)
> situation and circumstances

### Activation Examples
**Quantile 3** (max=69.51, pos=[68, 96, 97, 98, 99])
```
^{\ast}$(Ref.)representingtheeffectiveelectron-electronCoulombinteractionwhichsuppressestheCooper-pairformation,andexaminewhethertherangeoftheresulting$T{\rmc}$coverstheexperimentallyobservedvalue.Withsuchasemi-empiricalframework,thematerialdependenceoftheelectron-electroninteractioncannotbeunderstoodquantitatively.[The]recentprogressinthedensityfunctionaltheoryforsuperconductors(SCDFT)[@Oliveira;...
```

**Quantile 3** (max=66.11, pos=[11, 12, 13, 14, 15])
```
)(986-1014)[the][situation][was][stabili][sed][,]althoughraidsagainstHaithabuwouldberepeated.Haithabuwasonceagainandultimatelydestroyedbyfirein1066.AsAdamofBremenreportedin1076,theEiderRiverwastheborderbetweenDenmarkandtheSaxonterritories.FromthetimeDanescametoSchleswigfromtoday’seasternpartofDenmarkandGermanscolonisedSchleswigmigratingfromHolstein,[the]countrynorthoftheElbehadbeenthebattlegroundo...
```

**Quantile 2** (max=57.47, pos=[30, 31, 32, 34, 35])
```
proponentsofGermanunificationincreasinglyexpressedthewishtoincludetwoDanish-ruledprovincesHolsteinandSchleswiginaneventual'GreaterGermany'.HolsteinwascompletelyGerman,[while][the][situation]in[Schleswig][was][complex].ItwaslinguisticallymixedbetweenGerman,DanishandNorthFrisian.[The]populationwaspredominantlyofDanishethnicity,butmanyofthemhadswitchedtotheGermanlanguagesincethe17thcentury.Germancult...
```

**Quantile 2** (max=56.53, pos=[31, 75, 76, 78, 79])
```
economicissues,westandunited."Well,…mentor-student,vastexperienceinallmattersandfather-son...whatdowemakeofthose[sweet]endearingwords?Hmmm,AnwarhadsaidthisofMahathirduringAAB'stimewhenthelatterwasencounteringmuchoproblemowithHisImperialMaharaja,wakakaka,thatMahathirwassufferingfromdelusion[about][his]stewardship[of][the][country]:“Heissurroundedbytokampu(applepolishers)whonevertellhim[the][real][p...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.65 |
| score_embedding | 0.3175 |
| score_fuzz | 0.6667 |
| score_detection | 0.7417 |
| explanation_semantic_sim | 0.4537 |

### Position: (0.4637, 0.3071)
### Distances: ngram=4.3243, context=5.3346, noisy=4.3196
### Current: **missed_ngram** (margin: 0.0047)

### Your Tag: _____________

---

## Feature 4090 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.7233)
> Adjectives and adverbs indicating multiplicity, variation, or specificity, often used to describe or quantify nouns or concepts.

### Activation Examples
**Quantile 3** (max=118.48, pos=[5, 6, 7, 56])
```
improvedwatertank.[Various][types][of]humidifiersareusedtoprovidemoisturetoindoorair.Includedamongsuchhumidifiersareultrasonichumidifiers,steamhumidifiersorvaporizers,andevaporativehumidifiers.Ultrasonichumidifiersemployahigh-speedoscillator,positioneda[given]distancebelowthewatersurface,toenergizethewaterandbreakitintoafinemist.Afancarriesthemistintothesurroundingenvironment.Itiscriticalthatthedi...
```

**Quantile 3** (max=112.18, pos=[3, 4])
```
learned,including[various][ways]toensurethatbackupelectricalpowerwouldbelesslikelytobelost,morelikelytobesubsequentlyrestored,andperhapsevenlesslikelytobeneeded;specifically,thearticlecallsout6"lessons":LESSON1:Emergencygeneratorsshouldbeinstalledathighelevationsorinwatertightchambers.LESSON2:Ifacoolingsystemisintendedtooperatewithoutpower,makesureallofitspartscanbemanipulatedwithoutpower.LESSON5:...
```

**Quantile 2** (max=104.48, pos=[21])
```
andsoulofferedtoGodisalsooblation.Thisisequivalenttohōmam.3.[Various]purifyingactionsperformedduringpujaa.snānha–ablution,pāna–intakeofwaterandfoodofferedtoGodb.pādya–chantwithcleanandclearheartandintellectc.arghya–waterofferedwithrespectfromtheriveroffaithd.āchamana–waterusedforsippingsamerivere.abhiśeka–forthelordf.MindfilledwiththeflowofthoughtsofGodfromtheriveroffaith,ṣraddha–
```

**Quantile 2** (max=104.39, pos=[94])
```
antformulationcomponentsincludingatleastagasgeneratingfuelandasufficientquantityofwatertorendertheprecursorspraydryable.Whilethebroaderpracticeoftheinventionisnotlimitedbythespecificamountofwateraddedduringsuchprocessing,ithasbeenfoundgenerallydesirablethatwaterbeaddedinsufficientquantitythatthespraydryablegasgenerantformulationprecursorslurrycontainsbetweenabout30wt.%andabout35wt.%water.Itwillbea...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.875 |
| score_embedding | 0.5567 |
| score_fuzz | 0.85 |
| score_detection | 0.6917 |
| explanation_semantic_sim | 0.5508 |

### Position: (0.493, 0.2926)
### Distances: ngram=5.6092, context=5.8585, noisy=5.6105
### Current: **noisy_activation** (margin: 0.0013)

### Your Tag: _____________

---

## Feature 6913 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gpt-4o-mini, Quality: 0.5607)
>  Java programming constructs related to application context and configuration

### Activation Examples
**Quantile 3** (max=98.87, pos=[13, 26, 32, 34, 35])
```
scorer.app;importcom.scorer.game[.]BattingStats;importcom.scorer.game[.]Player;importorg[.]springframework[.][context][.][Application][Context][;]importorg.springframework[.][context][.][support][.]ClassPathXmlApplicationContext;publicclassMainApp{publicstaticvoidmain(Stringargs[]){Application[Context]context=[new]ClassPathXmlApplication[Context]("spring-config.xml");BattingStatsbattingStats[=](Ba...
```

**Quantile 3** (max=87.08, pos=[23, 25, 26, 27, 35])
```
,enablingyoutodynamicallycalculatewhatevervariablesyouneedtopassintobeanconstructors.packagecom.example;[import]java[.][net][.]URI;importjava.net[.]URISyntaxException;importorg[.]apache[.]commons[.]db[cp][.]BasicDataSource;[import]org[.]springframework[.][context][.][annotation][.]Bean;importorg.springframework.[context][.][annotation][.]Configuration;importcom.scorer[.]game[.]BattingStats;@Config...
```

**Quantile 3** (max=81.21, pos=[2, 8, 10, 18, 26])
```
.web[.]reader;importjava[.]io[.]IOException;importjava.io[.]InputStream;importjava.lang[.][annotation][.]Annotation;importjava.lang.[reflect][.]Type;importjava.util[.]Arrays;importjava.util[.]Collections;importjava.util[.]HashMap;importjava.util.HashSet;importjava.util.Iterator;importjava.util.List;importjava.[util].Map;importjava.util.Set;importjavax.[servlet][.]ServletContext;importjavax.ws[.][r...
```

**Quantile 2** (max=80.58, pos=[1, 9, 11, 15, 27])
```
concurrent[.]Futures;importcom.google[.]common[.]util.concurrent[.]ListenableFuture;importcom.google.common[.]util.concurrent[.]SettableFuture;importcom.google.[gson][.]JsonObject;importcom.google.[gson][.]JsonArray;importcom.google.[gson][.][annotations][.]SerializedName;importcom.google.gson[.][reflect][.][Type]Token;importcom.google.gson[.][Gson];importcom.google.[gson][.]GsonBuilder;importcom....
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.6044 |
| score_embedding | 0.5067 |
| score_fuzz | 0.544 |
| score_detection | 0.4857 |
| explanation_semantic_sim | 0.3751 |

### Position: (0.4715, 0.3044)
### Distances: ngram=3.8302, context=4.5613, noisy=3.8336
### Current: **missed_ngram** (margin: 0.0034)

### Your Tag: _____________

---

## Feature 12668 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.4183)
> multi-line symbols and prefixes

### Activation Examples
**Quantile 3** (max=92.21, pos=[24, 25, 37, 38, 68])
```
N$-bodymapsarepositivelyskewed,asphysicallyexpected.Thereconstructed,noisymapsarenegativelyskewed,forboththe[$][N]$-bodyandGRFcases.However,thereconstructed[$][N]$-bodyresultsarelessnegativelyskewedthanthereconstructedGRFresults(bottompanelofFig.\[fig:skew\]),presumablybecausethe[$][N]$-bodyPDF(andpeaks)containcontributionsfromthephysicalskewness,whichispositive(seeFigs.\[fig:noiseless\_PDF\]and\[...
```

**Quantile 3** (max=81.72, pos=[52, 53, 58, 59, 88])
```
tumorbiopsyextracts.ThefirstthirtyPCsfromthisfirststageofanalysiswerethenclassifiedusinganetwork.Morerecently,theperformanceoflineshapefittingandquantitativeANNanalyseswerecomparedbyHiltunenetal.\[[@B35]\]forboth[*][in]vivo*andsimulated[^][1]^Hspectra.Thegoodcorrelationobtainedwiththesetwoapproaches,forsimulateddataatleast,suggestedthatANNshavepotentialforquantificationof[*][in]vivo*MRSlongechotim...
```

**Quantile 2** (max=75.23, pos=[4, 87, 88, 89, 103])
```
thedifferencesbetweenthe[$]N$-bodyandGRFcasesinFigs.\[fig:noisyPDF\]and\[fig:noisypk\]areclear,understandingtheirdetailedstructureismorecomplex.First,notethattheGRFcasesexhibittheskewnessdiscussedinSec.\[sec:recon\_noise\],whicharisesfromthereconstructionnoiseitself.WeshowtheskewnessofthereconstructedPDF(forboththe[$][N][$-]bodyandGRFcases)comparedwiththatofthenoiseless[($][N]$-body)PDFforvariouss...
```

**Quantile 2** (max=74.7, pos=[39, 58, 75, 97, 100])
```
]).Thus,amajorgapinourunderstandingofsHSPmechanismistheconsiderablelackofinformationaboutwhichsubstratestheyprotectinthecell.Inordertoinvestigatethepropertiesofproteinsthatare[s]HSPinteractors,weidentifiedHSP16.6fromthesingle-celledcyanobacterium[*]Synechocystis*sp.PCC6803(hereafter[*]Synechocystis*)asanidealsystemtointerrogate.HSP16.6istheonly[s]HSPin[*]Synechocystis*(GieseandVierling[@CR12];Leee...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2441 |
| score_embedding | 0.2483 |
| score_fuzz | 0.4417 |
| score_detection | 0.3917 |
| explanation_semantic_sim | 0.525 |

### Position: (0.5011, 0.238)
### Distances: ngram=3.466, context=3.4623, noisy=4.6117
### Current: **missed_ngram** (margin: 0.0037)

### Your Tag: _____________

---

## Feature 13827 (boundary: boundary_missed_ngram_noisy_activation)

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

## Feature 11803 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4042)
> Function words and prepositions, often used to connect clauses or phrases, and sometimes articles, nouns, and verbs that are part of formal or official language, particularly in legal or formal documents.

### Activation Examples
**Quantile 3** (max=109.53, pos=[42, 78, 79, 108, 109])
```
thatshehadthedrawingpowertotour”LeonardRowewroteinhisbook.HetriedhisbesttoconvinceMichaelJacksontotourasJanetbeingtheopeningactbuttherewasnoconvincingMichael.SoMr.[Rowe]askedRKellytotourwithJanetJackson.RKelleyagreed.Later,JanetthoughtthatRKelleywouldstealthespotlightsoshechangedhermindabouttouringwithRKelly.[Leonard][Rowe]proceedingplanningjustanRKelleyTour.HebookedNeYoasanopeningactforRKelley.Ul...
```

**Quantile 3** (max=104.57, pos=[28, 29, 30, 31, 32])
```
buttorescindourinvitationtothemtoappearinourtribute”WhomGlobalLiveEventsheardwasNOT“Michael’sfans”[but][a][potential][lawsuit][and][the][possibility][of][the][Estate]Exec[uters][throwing][a][monkey]wrench[into][their][event].Wearealsodispleased[by][their][absurd]remark[that]MichaeladmiredKiss.Thatisacompletelyinaccuratenonsense.[We]do[NOT][feel]rightaboutGlobalLiveEvents,wedonottrustthem,wedonotwi...
```

**Quantile 2** (max=92.1, pos=[6, 8, 9, 10, 19])
```
U.S.C.[§][1][9][8]8.[3]Respondent[had][been]takenintocustodybyDallas,Texas,policeanddetainedforthreedaysafterrunningaredlight[.]PolicerecordshadindicatedthathewaswantedinPotterCountyonanothercharge.Actually,thePotterCountyoffensehadbeencommittedbyrespondent'sbrother,whohadmasqueradedasrespondent[.][Claim]ingthatthePotterCountysheriff[was][negligent]infailingtoinvestigateandlearnofthemistakenidenti...
```

**Quantile 2** (max=92.09, pos=[5, 7, 37, 39, 40])
```
asemployees.Rather,[plaintiff]considered[the]drivers,includingHalfhill,tobeindependentcontractorsforfederaltaxpurposesand,therefore,plaintiffdidnotpayemploymenttaxesonthedrivers'compensation[.][Eventually][,][in][light][of][tax][assessments][levied]bytheInternalRevenue[Service][,][plaintiff]paidemploymenttaxesforhisdriversforthe[second]halfof1[9][9]0[in]theamountof$49.24[.][After]payingthisamount[...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4583 |
| score_embedding | 0.1942 |
| score_fuzz | 0.3667 |
| score_detection | 0.3417 |
| explanation_semantic_sim | 0.4265 |

### Position: (0.497, 0.2437)
### Distances: ngram=3.3679, context=3.3725, noisy=4.5319
### Current: **noisy_activation** (margin: 0.0046)

### Your Tag: _____________

---

## Feature 3548 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4167)
> Various tokens and phrases from different contexts, including book excerpts, academic papers, and online articles, often indicating the start or end of a quotation, a title, or a proper noun, and sometimes highlighting specific words or phrases within a sentence.

### Activation Examples
**Quantile 3** (max=90.53, pos=[1, 2, 3, 4, 5])
```
transcription[s][are][largely][available][only][in][out][-][of][-][print][editions][.][R].A.Fo[akes][’][s]1[9]7[7][photographic][facsimile][edition][of][two][volumes][of][manuscripts][(]The[Hens]lowePapers[)][had][a][limited][printing][and][only][covers]20[%][of]therelevantarchive[.][The][2][0][0][2][re][printing][of]Fo[akes][’][s][standard][1][9]6[1][edition][of][Hens]lowe[']sDiary[(][Cambridge][...
```

**Quantile 3** (max=79.32, pos=[1, 2, 3, 4, 5])
```
5[Volumes][,][London][,][privately][printed][,][1][8][7][5][–][9][4][.][Chambers],E.K.TheElizabethanStage.[4][Volumes][,][Oxford][,][Clarendon][Press][,]192[3].Eyre,G.E.B.,andG.R.Rivington,[eds].ATranscriptoftheRegistersof[the]WorshipfulCompanyof[Station]ersfrom[1][6][4]0[–][1][7][0]8[.][3][Volumes][,][London][,][privately][printed][,]1[9][1][3]–1[4].Greg,[W][.]W[.,][and][E][.]Boswell[,][eds][.]Re...
```

**Quantile 2** (max=68.94, pos=[13, 14, 15, 16, 17])
```
,theCarolineera,andespeciallyforEnglishRenaissancetheatre—the[Station][ers]['][Register][is][a][crucial]and[essential][resource][:][it][provides][factual]information[and][hard]datathatisavailable[nowhere][else][.][Together][with][the]records[of][the][Master][of][the][Revel]s(whichrelate[to][dramatic][performance]rather[than][publication][),][the][Station][ers][']Registersuppliesmanyof[the]certainf...
```

**Quantile 2** (max=68.58, pos=[12, 13, 14, 15, 17])
```
CollegeofGod’sGiftatDulwich(London[:][privately][printed][,][1][9]0[3][).][Half][of][these][manuscript][volumes][and][most][of][the][mun]imentsconcerntheprivateaffairsand[non][-]theat[rical]businesses[of][the]Hens[lowe][and][Alle]ynfamilies,aswellasthehistoryofDulwichCollegesinceitsinception[.]It[is]the[other][half][of][these]volumes[,]representingthetheatricalaffairs[of][Hens][lowe][and][Alle]yn,...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.375 |
| score_embedding | 0.0 |
| score_fuzz | 0.5333 |
| score_detection | 0.5667 |
| explanation_semantic_sim | 0.4038 |

### Position: (0.5096, 0.2962)
### Distances: ngram=4.1782, context=4.0099, noisy=4.0057
### Current: **noisy_activation** (margin: 0.0042)

### Your Tag: _____________

---

## Feature 13700 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5392)
> Punctuation and whitespace characters, often marking the end of a statement, block, or section, and sometimes indicating the start of a new one.

### Activation Examples
**Quantile 3** (max=144.42, pos=[13, 14, 16, 18, 19])
```
languageid.Ifnotfound,createsanewone.*[*][@]paramint$idLanguageSourceid[*][@]paramstring$languageIdLanguagelanguageid[*][*][@]returnLanguageTranslate[*][*][@][deprecated][since][version]1.2.7[*/]publicstaticfunctiongetLanguageTranslateByIdAndLanguageId($id,$languageId){$languageTranslate=self::findOne(['id'=>$id,'language'=>$languageId]);if(!$languageTranslate){$language
```

**Quantile 3** (max=144.36, pos=[7, 27, 31, 36, 37])
```
}return$data[;]}/***Returnsthelanguageelementinallotherlanguages.*[*]@returnLanguageTranslate[[]]*/publicfunctiongetTranslatedLanguages(){returnstatic::find()->where('id=:idANDlanguage!=:language',[':id'=>$this->id,'language'=>$this->language])->all();}/***@staticvararray$languagenamescachingthelistoflanguages.[*]*[@]return[string]*/
```

**Quantile 2** (max=131.71, pos=[46, 47, 48, 49, 53])
```
publicStringtoString(){returnthis.code+"("+this.name+")";}/***Compareto**@paramoObject[*][@]returnInt*/@OverridepublicintcompareTo(Objecto){returnthis.code-((Tag)o).getCode();}//</editor-fold>}<bos>Hadagreatdayhere,itsaproperlittlesuntrapandoutthewind.Loadstoclimboverandrummageround,I
```

**Quantile 2** (max=125.94, pos=[110, 111, 112, 115, 116])
```
;publicfunctionconstruct(){parent::__construct(Mage::getConfig()->getNode('global/sales/order'));}protectedfunctiongetStatus($status){return$this->getNode('statuses/'.$status);}protectedfunctiongetState($state){return$this->getNode('states/'.$state);}/***Retrievedefaultstatusforstate**@paramstring$state[*][@]return[string]*/publicfunctiongetStateDefaultStatus($
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.65 |
| score_embedding | 0.2883 |
| score_fuzz | 0.4583 |
| score_detection | 0.4417 |
| explanation_semantic_sim | 0.307 |

### Position: (0.4845, 0.3043)
### Distances: ngram=3.8784, context=4.2406, noisy=3.8724
### Current: **noisy_activation** (margin: 0.006)

### Your Tag: _____________

---

## Feature 150 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4333)
> Prepositions and articles often precede nouns, while verbs and adjectives often follow nouns, and sometimes function words like \"of\", \"in\", \"to\", and \"is\" are used to connect clauses or phrases.

### Activation Examples
**Quantile 3** (max=64.12, pos=[7, 8, 9, 10, 12])
```
doesn’twearSony’s[new][and][rather][stylish]Mon[olith][design][.]Insteadyou[get][a][straightforward][but][sleek][black][bezel]forthetop,rightandleftsides,with[a][slightly]proudmetallicstripalongthebottomedge.[The]setstill[looks]nice,[though],forallits[non][-]Mono[li][thic]approach.Itdoesn’tdothe40HX803‘[s]aestheticimpactanyharm,either,thatitemploysedgeLEDlightingtodeliverareasonably[slender]profil...
```

**Quantile 3** (max=63.45, pos=[20, 25, 26, 27, 28])
```
.SantaFeplannedtobemarketedinEuropestartinginJunefollowedbyAmericaandChina.Santa[Fe]isapremiumcar[with][a][more][daring][design]thatis['][Fluid][ic][S][cl]up[ture]['][with][trapez][oid][shape][grille][.][Side][mirror]-[like][leaves]thatprovideavery[sporty][impression][.]SantaFewillbeavailableintwovariantswithspecificationsofdifferentmachinesandhaulage.First,Sport[y]withThetaIIengine264PSwithacapac...
```

**Quantile 2** (max=46.75, pos=[9, 74, 75, 76, 77])
```
theHondaCBR150R.A[fa]iredversionoftheCBHornet160RdoesmakesenseasSuzukihasachievedgreatsuccesswiththeGixxerSF,whichisthefairedversionoftheGixxer155ccmotorcycleandcurrentlyholdsthedistinctionofbeingthecheapestfull-fairedmotorcycleonsaleinIndia.The[muscular][styling][of][the]CB[Hornet]160[R][has]playedakeyrolein[its]successandweexpect[the]newHondamotorcycle[to][get][sharp][and][sporty][styling].Itisl...
```

**Quantile 2** (max=46.63, pos=[15, 22, 36, 38, 40])
```
hadnotyetbeenintroduced.ManyotherhousesalongtheNyhavnquayfeature[similar]signs.Anappendixwith[staircase]ontherearsideofthebuildingdatesfrom187[5].[The]courtyard[was][refurbished][in]196[3][to][design][by][the][landscape][architect][Knud][Lund][-]Sø[rensen].TodayTheleadingDanish[lamp]manufacturer[Louis][Pou]lsenhasbeenheadquartered[in]thebuildingsince1[9][0]8.ReferencesExternallinksPhotographsofthe...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.1392 |
| score_fuzz | 0.4167 |
| score_detection | 0.4667 |
| explanation_semantic_sim | 0.2948 |

### Position: (0.4909, 0.3007)
### Distances: ngram=3.6718, context=3.9713, noisy=3.6766
### Current: **noisy_activation** (margin: 0.0048)

### Your Tag: _____________

---

## Feature 14866 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.6483)
> paragraph markers

### Activation Examples
**Quantile 3** (max=36.12, pos=[16, 34, 79, 95, 109])
```
criminalcase,towhichthewitnessreplied,“No.”Theprosecutorthenasked,“[W]hoisit,accordingtoyourunderstanding,thatmakesthosedecisionsonwhetheracasegetsfiledcriminally?”Thewitnessresponded,“Acomplaint’smadetoapolicedepartmentorsheriff’sdepartmentandtheymakethatdecisioninconjunctionwithIbelieveyou.”Theprosecutorclarifiedthat“you”meantthedistrictattorney’soffice.Thedefensedidnotobject.¶34Duringrebuttalcl...
```

**Quantile 3** (max=33.34, pos=[24, 51, 61, 81, 105])
```
P.3d216,225(Colo.App.2009);seealsoCrider,186P.3dat43.Forexample,areviewingcourtmayconsiderwhetherproperjuryinstructionsmitigatedtheprejudicialeffectofprosecutorialmisconduct.SeePeoplev.Castillo,2014COA140M,¶78,P.3d,(concludingprosecutor[’]smisstatementswereharmlessinlightofinstructionsfromthetrialcourtandthedefense’
```

**Quantile 2** (max=29.57, pos=[6, 20, 35, 55, 71])
```
theGeneralAssembly’sintentthat,foramendatorylegislationtoapplyretroactivelytoadefendant’sconvictionorsentence,thelegislationmuststatethatitappliesretroactively.Thus,because,asnoted,the2013amendmentsdonotstatethattheyapplyretroactivelytoTrujillo’sconvictionandsentence,hemaynotseekretroactiveapplicationundersection18-1-410(1)(f)(I).¶91Finally,andwithallduerespect,IdeclinetofollowPeoplev.
```

**Quantile 2** (max=29.53, pos=[20, 40, 52, 96, 108])
```
ofconsequencetothedeterminationoftheactionmoreprobableorlessprobablethanitwouldbewithouttheevidence.”CRE401.Generallyspeaking,“[t]heColoradoRulesofEvidencestronglyfavortheadmissionofrelevantevidence.”Peoplev.Brown,2014COA155M-2,¶22,360P.3d167,172.However,relevantevidenceisneverthelessinadmissiblewhen“itsprobativevalueissubstantiallyoutweighedbythedangerofunfairprejudice,
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.4392 |
| score_fuzz | 0.6 |
| score_detection | 0.4333 |
| explanation_semantic_sim | 0.3983 |

### Position: (0.5184, 0.2929)
### Distances: ngram=4.6672, context=4.4127, noisy=4.4169
### Current: **noisy_activation** (margin: 0.0042)

### Your Tag: _____________

---

## Feature 6564 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gpt-4o-mini, Quality: 0.5633)
>  keywords associated with exporting modules and components in programming, particularly in JavaScript and related frameworks

### Activation Examples
**Quantile 3** (max=187.24, pos=[28, 34, 35, 37, 38])
```
{CURRENT=currentAuthority;}}else{CURRENT='NULL';}[return]Authorized;};[export][{]CURRENT[};][export][default]Authorized[=>]renderAuthorize(Authorized);<bos>TheSamsungGALAXYTab7.0Plushasbeenofficiallyannounced,whichbringsyetanotherHoneycomb-flavoredtablettothescene.Whatwearedealingwithisadevicemeanttobeasuccessortotheoriginal7-inchGALAXYTab,whichdebutedaboutayearago,andstandingatadbelowtherecentlyu...
```

**Quantile 3** (max=179.39, pos=[67, 68, 71])
```
js';functioncreateNewContainer(name){varnewContainer=document.createElement('div');newContainer.className='container';newContainer.id='t-'+time.now();newContainer.setAttribute('moduleName',name);returnnewContainer;}[export][const]FadeTransition[=]{start(container){if(container){container.style.opacity=0.001;document.querySelector('#containers').appendChild(container);}},asyncperform(oldModule
```

**Quantile 2** (max=161.95, pos=[50])
```
.style.opacity=1.0;}//TODO(applmak):Maybewaituntilcsssaysthatthetransitionisdone?awaitdelay(time.until(deadline));}}[export]classClientModule{constructor(name,path,config,titleCard,deadline,geo,transition){//Themodulename.this.name=name;//Thepathtothemainfileofthismodule.this.path=path;//Themoduleconfig.this.config=config;
```

**Quantile 2** (max=149.73, pos=[64, 65, 76, 77])
```
TouchableHighlight,ActivityIndicator,}from'react-native';import{createAppContainer}from'react-navigation';import{createStackNavigator}from'react-navigation-stack';import{Card,Image}from'react-native-elements';importConstantsfrom'[expo][-]constants';importaxiosfrom'axios';[export][default]classCategoryScreenextendsReact.Component{constructor(props){super(props);this.state={data:[],isVisible:true,ci...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.2425 |
| score_fuzz | 0.6833 |
| score_detection | 0.6167 |
| explanation_semantic_sim | 0.4532 |

### Position: (0.4996, 0.274)
### Distances: ngram=4.7095, context=4.7062, noisy=5.0987
### Current: **missed_context** (margin: 0.0033)

### Your Tag: _____________

---

## Feature 8133 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gpt-4o-mini, Quality: 0.5625)
> terms related to growth and development

### Activation Examples
**Quantile 3** (max=138.58, pos=[15, 16])
```
,toldushewasareader(!)andmentionedhowimportantitwasto[grow][up]inatownwithanartsfestival.Thenhequipped,“You’llknowit’sarealfilmfestivalwhenthefilmmakersstarthavingaffairswitheachother.”Lateinthereception,BobFeinberg,thefestival’sfounder,toldmetheopeningnightwasalmostexactlyashe’dpicturedit.“IthoughtaboutabanneracrossBloomfieldAvenueandIthoughtaboutallthesignsandaboutdoinganopeningnightinthistheate...
```

**Quantile 3** (max=138.25, pos=[1, 2, 7, 59])
```
has[grown][exponentially]year-upon-[year].Thisgraphunderlinestheimportanceofensuringthatyourwebsiteisfitforuseforallpotentialusers.You’repotentiallymissingoutonreachingthesecustomersifyoursitedoesn’tmeettheirdemands,and,withthetrendofmobilebrowsingonlysetto[rise],optimisingyourwebsitetoensureit’sfitforuseisquicklybecomeanecessityforonlineretailers.OurLiquidshope-commerceplatformisdesignedtoprovide...
```

**Quantile 2** (max=133.33, pos=[47, 48])
```
justfortechnicalreasons,butalsobecauseofsocial,cultural,andbusinessreasons.AmajoreventrecentlywasGoogle'sdecisiontotakeanewdirectionwiththeirproposednewDartlanguage.AsWeiqiGaoobserves,thishas[grown][into]quitethediscussion,withsomebackerswantingtocontinuetoimproveJavaScript,whileothersfeelthatit'stimetoembarkondesigninganewlanguage(suchasDart).Majordiscussionhasensued,andsomeoftheemotionshavebeenr...
```

**Quantile 2** (max=133.15, pos=[100, 101])
```
.CampwillrunfromOct.1-6atthePavilionGymontheUniversityofCalifornia,SantaBarbaracampus.TheteamwillheadbacktoNorthernCaliforniafortheirpre-seasonopenerontheroadagainsttheGoldenStateWarriorsonOctober7,beforeheadingtoLasVegastotakeontheLakersonOct.10.Aftertheinitialweekaway,theKingswillcontinuecampinSacramentoattheteam’spracticefacilityinNatomas.CowbellKingdomhas[grown][exponentially]sinceitsfoundingi...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.16 |
| score_fuzz | 0.7167 |
| score_detection | 0.6917 |
| explanation_semantic_sim | 0.6711 |

### Position: (0.5004, 0.2445)
### Distances: ngram=5.1788, context=5.1852, noisy=6.5741
### Current: **missed_context** (margin: 0.0064)

### Your Tag: _____________

---

## Feature 6145 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.64)
> questions and wonder

### Activation Examples
**Quantile 3** (max=104.8, pos=[118, 119, 120, 121, 122])
```
theupper-classpartoftown),thenyou’renevergoingtoknowwhattobelievebecausethemainstreammediaisquicktorepeatthemanipulations.TherearesomemainstreammediathatactuallycallVenezuelanPresidentHugoChavezadictator,despitethefactthatduringhistenyearsinofficetherehavebeenmorethanadozenfreeandfairelectionsinVenezuelalegitimatelyrecognizedbyinternationalobserversfromaroundtheworld,andthathehasalwaysrespectedthe...
```

**Quantile 3** (max=91.97, pos=[121, 125, 126])
```
candeliversocialandenvironmentalwins,andconversely,howsustainabilitycanbeframedandemployedasanopportunityinnovation.Inoneexchange,Betodescribedthesustainabilitydirector’sroleasanticipatingafuturesetofoperatingconditionsforacompanyandmakingthemrelevantandactionableinthepresenttense.Ilovethisdescription.Itfocusesontheimportanceofunderstandingawidebodyofsocial,environmental,commercial,economicandothe...
```

**Quantile 2** (max=86.79, pos=[57, 58, 59, 60])
```
$independentestimators,weobtain$95\%$confidenceintervalsindicatedbyblackerrorbarsinFigure\[fig:ar1:smoothingmeans\].Thetruesmoothingmeans,obtainedbyKalmansmoothing,areindicatedbyaline.Themethodisvalidforall$N$,which[prompts][the][question][of]theoptimalchoiceof$N$.Intuitively,largervaluesof$N$leadtosmallermeetingtimes.However,themeetingtimecannotbelessthan$2$bydefinition,whichleadstoatrade-off.Wev...
```

**Quantile 2** (max=86.18, pos=[4, 64, 65, 66])
```
gameconsoles.[So]adsshipenabledbydefaultuntilyoupayafeetohavethemremoved,that'sinteresting.Oddthattheydidn'tjustdoitlikethee-inkKindlesandmakeaSKUwithnoads.Guessthey'rehopingmanypeoplewon'toptout.The[question][is][,]willconsumersselltheirsoultoadcampaignsfor20to50bucksadevice?Ikindofhopethisfails,becauseifitdoesn't,thenwe'regoingtoseeadsoneverything--quiteprobablyincludingiOS.Soonerorlater,thelure...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.55 |
| score_embedding | 0.3225 |
| score_fuzz | 0.6917 |
| score_detection | 0.6833 |
| explanation_semantic_sim | 0.503 |

### Position: (0.4812, 0.2999)
### Distances: ngram=4.4268, context=4.9452, noisy=4.4265
### Current: **noisy_activation** (margin: 0.0003)

### Your Tag: _____________

---

## Feature 5067 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.5275)
> references to figures, code, and data in parentheses

### Activation Examples
**Quantile 3** (max=112.61, pos=[4, 6, 7, 12, 13])
```
edit-choice-[4]-[wrapper][">]<labelclass[="][option]["]for="[edit]-[choice]-[4]"><inputtype="radio"id="edit-[choice]-4"name="choice"value="4"[class][="][form][-][radio]"/>Yes,I&#039;dliketohavethatoption,butmaynotuseit</label></div><divclass[="][form][-][item]"id="edit-[choice]-[5]-[wrapper]"><labelclass[="][option]["]for="edit-choice-[5]"><inputtype="radio"id="edit[-]choice-5"name="
```

**Quantile 3** (max=105.8, pos=[16, 17, 18, 19, 23])
```
;tuseTimeOut</label></div><divclass[="][form][-][item]"id="[edit]-[choice]-[1]-[wrapper]"><labelclass[="][option]["]for="edit-[choice]-[1]"><inputtype="radio"id="[edit]-[choice]-[1]"name="choice"value="1"[class][="][form][-][radio]"/>IonlyuseTimeOutforfree</label></div><divclass[="][form][-][item]["]id[="]edit-choice-[2]-[wrapper]"><labelclass[="][option]["]for="edit-choice-[2]"><inputtype="radio"
```

**Quantile 2** (max=100.01, pos=[60, 61, 62, 63, 64])
```
<ahref="/accounting/viewallaccounts?_t=039f18daf35b4a00f0093dd17aa70730be385f6f&amp;torender=account"[class][="][first][accounting][page][menu]">Accounts(1)</[a]><ul><li><ahref="/accounting/details?_t=e3d4ea94f5ed862d95196a620f1147be
```

**Quantile 2** (max=99.8, pos=[22, 24, 31, 32, 33])
```
action="/rss.xml"accept-charset="UTF-8"method="post"id="poll-[view]-[voting]"><div><div[class][="][poll][">]<divclass[="][vote][-][form]"><divclass[="][choices][">]<divclass[="][form][-][rad][ios]"><divclass[="][form][-][item]"id="[edit]-choice-0-[wrapper]"><labelclass[="][option]["]for="edit-choice-[0]"><inputtype="radio"id="edit-choice-0"name="choice"value="0"[class][="][form][-][radio]"/>Idon&#...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4452 |
| score_embedding | 0.1792 |
| score_fuzz | 0.5417 |
| score_detection | 0.4833 |
| explanation_semantic_sim | 0.3824 |

### Position: (0.5138, 0.2968)
### Distances: ngram=3.9989, context=3.7512, noisy=3.7476
### Current: **missed_context** (margin: 0.0037)

### Your Tag: _____________

---

## Feature 6543 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4117)
> Prepositions, conjunctions, and articles, often in combination with nouns, verbs, or adjectives, that provide context and structure to sentences, as well as words that indicate possession, comparison, or physical properties.

### Activation Examples
**Quantile 3** (max=104.3, pos=[11, 12, 13, 14, 15])
```
timeandbiodieselproductioncost.<bos>Effectofclonidine[early][in][life][on][brain][morph][of][unction][al][deficits][induced][by][neonatal][malnutrition][in][the][rat][.]Agreatbodyofevidence[indicates][that][malnutrition][early][in][life][induces][central][nor][adren][ergic][hyper][activity][(]CNH[).][On][the]otherhand[,][it]is[known][that]norad[renaline](NA[)][is][an][important][regulator][of][the...
```

**Quantile 3** (max=103.01, pos=[8, 9, 10, 11, 12])
```
evidencetodatethatfoodinsecurityislinked[to][specific][developmental][consequences][for][children][,][and][that][these][consequences][may][be][both][nutritional][and][non]nutri[tional][.]<bos>[Q][:]["][Linear]isomorphism"[in]definition[of]vectorbundleI'mreadingoutofBroecker&Jaenich'sdifferentialtopologytext,andinthedefinitionofvectorbundleI'mhavingtroubleunderstandingwhatthey'retalkingabout.Thistr...
```

**Quantile 2** (max=82.97, pos=[1, 13, 15, 23, 24])
```
schizophrenia[and]15whodidnot.Thescientistsmeasured[the]levels[of]messengerRNA(mRNA)inthe[frontal][pole]ofthe[brain],the[dors]olateral[prefrontal][cortex],andthecingulatecortex.UsingmRNAlevels,theresearcherspredicted[genetic][pathways]“[that]wouldbeaffected[by]thechanges[in]geneexpression.”Schizophreniariskgene[plays][key][role][in][early][brain][development]Scientists[identify][a]risk[gene][for][...
```

**Quantile 2** (max=82.72, pos=[118, 119, 120, 121, 122])
```
1Solve-20<bos>Thereisnodenyingthefactthatnightshiftworkersarefastlosingontheirhealth.Longandhecticworkschedulesleadtoirregularappetites,rapidchangesinweightandahighriskofgastro-intestinal[…]After60years,authoritiesintheUnitedStateshaveapprovedapillthatwilltreatmalaria.AccordingtoareportinBBC,thedrug,tafenoquineisbeingdescribedasa“phenomenalachievement”andwilltreattherecurring[…]Compoundsingreentea...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4583 |
| score_embedding | 0.255 |
| score_fuzz | 0.4 |
| score_detection | 0.3333 |
| explanation_semantic_sim | 0.2826 |

### Position: (0.5222, 0.2994)
### Distances: ngram=3.9182, context=3.6849, noisy=3.6804
### Current: **missed_ngram** (margin: 0.0045)

### Your Tag: _____________

---

## Feature 14392 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gpt-4o-mini, Quality: 0.4442)
>  references to the Google brand and its associated technologies or libraries

### Activation Examples
**Quantile 3** (max=150.69, pos=[8, 9, 10, 11, 14])
```
concurrent.Futures;importcom.[google][.][common][.]util.[concurrent][.]ListenableFuture;import[com].[google][.][common][.]util.[concurrent][.]SettableFuture;importcom.[google][.][gson][.]JsonObject;import[com].[google][.][gson][.]JsonArray;importcom.[google][.][gson][.]annotations.SerializedName;importcom.[google][.][gson][.]reflect.TypeToken;importcom.[google][.][gson][.][Gson][;]importcom.[googl...
```

**Quantile 3** (max=142.91, pos=[39, 109, 110, 111, 112])
```
,TORTOROTHERWISE,ARISING*FROM,OUTOFORINCONNECTIONWITHTHESOFTWAREORTHEUSEOROTHER*DEALINGSINTHESOFTWARE.**/packagecom.[facebook].ads.sdk;importjava.io.File;importjava.lang.reflect.Modifier;importjava.lang.reflect.Type;importjava.util.Arrays;importjava.util.HashMap;importjava.util.List;importjava.util.Map;importcom.[google][.][common][.][base][.]Function;importcom.[google][.][common][.]util.
```

**Quantile 2** (max=136.23, pos=[1, 2, 3, 4, 7])
```
.[google][.][com][internet]address=74[.]125.193[.]27Sowecanfindnameserversofthetargeteddomain.$nslookup-q=ns[google][.]comServer:8.[8].8.8Address:8.8.8.8#53Non-authoritativeanswer:[google][.]comnameserver=[ns]3.[google].com.[google].comnameserver=ns1[.][google].com.[google].comnameserver=ns2.[google].com.[google].comnames
```

**Quantile 2** (max=133.33, pos=[2, 3, 5, 17, 22])
```
www.[google][.]de[/]patents/US6218728[?]utmsource=[gb][-][g][plus][-]sharePatentUS6218728-Mold-BGA-typesemiconductordeviceandmethodformakingthesameMold-BGA-typesemiconductordeviceandmethodformakingthesameUS6218728B1ZusammenfassungDisclosedisamold-BGA-typesemiconductordevicewhichhas:asemiconductorchipwhichincludesinsulatingresinfilmformedonatleastapartofthesurfaceofthesemiconductorchipexceptapad;ac...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.1917 |
| score_fuzz | 0.5583 |
| score_detection | 0.525 |
| explanation_semantic_sim | 0.3565 |

### Position: (0.4997, 0.2702)
### Distances: ngram=4.2665, context=4.2664, noisy=4.7029
### Current: **missed_ngram** (margin: 0.0001)

### Your Tag: _____________

---

## Feature 12085 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gemini-flash-2.5, Quality: 0.4675)
> astronomical objects and concepts

### Activation Examples
**Quantile 3** (max=113.23, pos=[4, 5, 6, 7, 8])
```
3-4[Myr][.][Comparing][the][disc][fraction][in][Taurus][to][young][massive][clusters][suggests][discs][survive][longer][in][this][low][density][environment][.][We][also][present][a][method][of][photo][metric][ally][de][-][red][den][ing][young][stars][using][$][i][Z][JH][$]data.'---[Introduction]============[Taurus][is][a][low][-][density][star][-][forming][region][containing][primarily][low][-][ma...
```

**Quantile 3** (max=100.37, pos=[7, 9, 10, 11, 12])
```
withamassof0.[7]5[M][$_][\][odot][$][to][the][middle][of][the][observed][sequence][.][We][find]consistency[with][the][overall][is]och[rone]fitting,[with][an][age][of][3][-][4][Myr][still]providingagoodfit[.][With][a][robust][age][for][Taurus][we][then][examined][the][disc][fraction][.][Taurus][has][a][disc][fraction][of][6][9][%][[@][L][uh][man][2][0][1][0][(][L][uh][man][et][al][.]2[0][1][0][)].]...
```

**Quantile 2** (max=88.59, pos=[6, 7, 8, 9, 10])
```
ontopofasinglewhite[dwarf][,][changing][only][its][composition][.][Having][a][fixed][mass][and][radius]we[can][compare][the][times]cales[,][convective]flow[,][energe]tics[and][dredge][up][in][the][different]cases[.][A][more][comprehensive]studywhich[varies][the][white][dwarf][’][s][mass][with][compositions][is]left[to][future]work[(][CO][,][O][Ne]([Mg][)][or][He][rich][).][The][present]studyislimi...
```

**Quantile 2** (max=86.59, pos=[5, 6, 9, 20, 22])
```
linesarereddeningvectors[in][this]colourspace[.]**Right:**$r$,$r$-$i[$]diagram[for][Taurus][members][identified][as][Class][III][.][Iso][ch][rones][of][1][,][4][and][1][0][Myr]areoverlaid[.][Aster]isks[indicate][the][position][of][a][theoretical][star][with][mass][0][.][7][5][M][$_][\][odot][$.][The][black]dashedline[shows][a][redd]eningvector[for][A]$_V$[=]1mag[.][]{data-label="fig[:][iz]jh[age]"...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.4583 |
| score_embedding | 0.1258 |
| score_fuzz | 0.5083 |
| score_detection | 0.5583 |
| explanation_semantic_sim | 0.3842 |

### Position: (0.4866, 0.2986)
### Distances: ngram=3.8295, context=4.1652, noisy=3.8254
### Current: **missed_ngram** (margin: 0.0041)

### Your Tag: _____________

---

## Feature 10399 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.5742)
> parts of place names

### Activation Examples
**Quantile 3** (max=70.24, pos=[12, 22, 23, 24, 25])
```
TheStreet.NewspaperrecordsOn31August1921itwasreportedinthe[Suffolk][Free][Press][that][the][remains][of][George][Nunn][aged][5][5][of][Law][shall][were][discovered][hanging][in][Fri][thy][Wood][.][He]hadbeenmissingforaround[4]monthssince22April[and][was][found][a][short][distance][from][where][he][lived][.][Access][The][woods][are][not][private][with][easy][access][.][References][Category][:][Fore...
```

**Quantile 3** (max=69.58, pos=[82, 83, 84, 85, 86])
```
theexpectedoutputThanks,AmarA:ReadtheJavaDocforHttpHost:Parameters:hostname-thehostname(IPorDNSname)Soyoushouldusejust(omittheprotocolandcontext):HttpHosttarget=newHttpHost("<JENKINSURL>");andthenHttpGetthe/api/jsonpart.Cheers,<bos>StAndrew'[s][Church][,][Red][bourne][St][Andrew]'[s][Church][is][a][redundant][Anglican][church][in][the][village][of][Red][bourne][,][Lincolnshire][,][England][.][It][...
```

**Quantile 2** (max=62.17, pos=[12, 13, 14, 15, 16])
```
requiredtopayatarifftocontributetowardstheenhancementofexisting[SANG][s][,][where][such][sites][have][been][identified][by][the][local][authority][.][Wa][verley]['][s][only][current][SANG][resource][is][at][Farn][ham][Park][.][The][SANG][capacity][at][Farn][ham][Park][is][a][finite][resource][in]terms[of][the][numbers][of][new][dwellings][it][can][support][.][The][remaining][(][un][allocated][)][c...
```

**Quantile 2** (max=61.56, pos=[3, 11, 12, 13, 14])
```
greenwoodpecker,[great]spottedwoodpeckerandlesserspottedwoodpeckerwhich[breed][regularly][.][Roe][deer][,][fallow][deer][and][munt]jaccanalso[be][seen][in][the][woods][but]theyhavecausedconsiderabledamage[to][the][ground]vegetation[.][Forest]school[Forest]schoolsessionsare[held][in][Fri][thy][Wood][by][permission][of][the][landowners][.][The][']school'representsaninitiative[of][All][Saints][Primar...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.3 |
| score_embedding | 0.2158 |
| score_fuzz | 0.6917 |
| score_detection | 0.6833 |
| explanation_semantic_sim | 0.5572 |

### Position: (0.4922, 0.2929)
### Distances: ngram=4.5679, context=4.8077, noisy=4.5615
### Current: **missed_context** (margin: 0.0064)

### Your Tag: _____________

---

## Feature 10780 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5967)
> Verbs in the past tense, often used to describe completed actions or states, sometimes in formal or written contexts.

### Activation Examples
**Quantile 3** (max=110.5, pos=[36, 37])
```
asubsetofrows,flexiblesmartfilteroptions,styles,darkmode,andmanymorefeatures,yetisverysimpletogetstarted.</p><p>SheetPlanner[was][written]bymeoverthepast18monthsorso,asa<ahref="/consulting/">Dejalconsultingproject</a>forSheetPlannerSoftwareLLC.</p><p><ahref="/files/2018/sheetplanner/planning.png"title="Clickforfullsize."><imgsrc="/files/2018/sheetplanner/planning.png"alt="SheetPlannerplanningdocum...
```

**Quantile 3** (max=108.21, pos=[32, 33])
```
seeablegetsinthewayTouristEyewillhelpfindrestaurants,touristsitesandmoreonthefly.FreeAlsoavailableforAndroidShopNear.meThisapp[was][designed]fortrendyshoppersandatthemomentfeaturesthebestplacestogetyourshoponinthecitybythebaywithpromiseformorecitiesinthefuture.Youcansearcheitherbyitem(shoes,blouses,dressesandmore)orbyshopandusethesaletabtofindsavingsnearby.FashionistaswholiveorarevisitingSanFranci...
```

**Quantile 2** (max=96.91, pos=[10, 35, 54, 55, 74])
```
a>version2.5.Ifyou[missed]them,takealookatthereleasenotesor<ahref="/blog/release">blog</a>forwhat[changed].</p><h4>IntroducingSheetPlanner</h4><p>AnexcitingnewMacapp[was][introduced]recently:<ahref="/consulting/sheetplanner/">SheetPlanner</a>.Thisapp[was][written]bymeasaconsultingproject.Itisapro-leveloutliner,planner,todo,calendar,andmore.</p><p>Version1.0ofthisapp[was][well]-received,andwe'rewor...
```

**Quantile 2** (max=96.75, pos=[95, 96, 97])
```
2009onthesafetyoftoysandalllegalstandardsunderCzechlegislation.Ofcoursethereisadeclarationofconformity.SpecificationsCompareRecommendedagefrom3year(s)ReportanerrorDone!OnlinechatDearcustomer,yourquestionyoucansendusamessageviathecontactformhere,respectively.youcansolveyourqueryonlineusingchat.Ifyouwanttousethechatlog,please.<bos>//Thisfile[was][generated][by]gogenerate;DONOTEDITpackagecurrencyimpo...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.875 |
| score_embedding | 0.1517 |
| score_fuzz | 0.7583 |
| score_detection | 0.725 |
| explanation_semantic_sim | 0.5377 |

### Position: (0.4993, 0.2735)
### Distances: ngram=5.1047, context=5.0987, noisy=5.4999
### Current: **missed_ngram** (margin: 0.006)

### Your Tag: _____________

---

## Feature 1108 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.7075)
> Proper nouns, names of people, places, and organizations, as well as technical terms and abbreviations, often appear as significant tokens in the text.

### Activation Examples
**Quantile 3** (max=143.02, pos=[86, 87, 88])
```
↓colonicTNF-αproteinlevels&mRNAexpressionupregulatedbyDSSexposure\[[@B50]\]11-15/groupweek3[Gal][acto][-]mannans\8-month-SDrats,5/group5%ofdiet3weeksOlderanimals↓
```

**Quantile 3** (max=142.73, pos=[13, 14, 21, 22, 87])
```
0-180MOneoftheMostFY18[Gal][af]oldFY19GlobalRevenue[Gal][af]oldSuccessfulRareRev.GuidanceDiseaseLaunchesGeographic24CountrieswithExpansioninPricing&2019Reimbursement8Regulatory348Approvals:AmenableAustralia,Canada,EU,VariantsinU.S.Israel,Japan,S.Korea,Switzerland,U.S.Label[Gal][af]oldisindicatedforadultswithaconfirmeddiagnosisofFabryDiseaseandanamenablemutation/variant.Themostcommonadversereaction...
```

**Quantile 2** (max=135.43, pos=[46, 47, 48])
```
mg/kginfood[Gal][acto][-]mannan(partiallyhydrolyzedguargum)*Cyamopsistetragonolobus*10-week♀BALB/cmice,\5%ofdiet3weeksDSS-inducedUCatbeginningof\↓diseaseactivityindexscores,↓colonicmucosalmyeloperoxidaseactivity&lipidperoxidation;
```

**Quantile 2** (max=135.36, pos=[1, 2, 3, 16, 25])
```
(*[Gal][8][0]^ts^EcRB1DN*)larvaeweregrownat18°C(permissivefor[Gal][8][0]~ts~),transferredto29°C(restrictivefor[Gal]80*^ts^*-*EcRB1DN*isexpressed)atlatelarvalstageandhemocytemotilitywasmeasured18hlaterin1hAPF-prepupae.P\<0.001.MeanandSEMaredisplayed.(TIF)######Clickhereforadditional[data]file.######**Pupaeinwhichhemocytesexpress
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.2692 |
| score_fuzz | 0.6167 |
| score_detection | 0.65 |
| explanation_semantic_sim | 0.3321 |

### Position: (0.4905, 0.294)
### Distances: ngram=4.6888, context=5.1181, noisy=4.6815
### Current: **missed_ngram** (margin: 0.0073)

### Your Tag: _____________

---

## Feature 5283 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (gpt-4o-mini, Quality: 0.5342)
>  syntactic structures and grammatical patterns

### Activation Examples
**Quantile 3** (max=94.88, pos=[7, 8, 9, 10, 11])
```
root(ROOT-0,What[-][1][)][cop][(][What][-][1][,][is][-][2][)][det][(][time][-][4][,][the][-][3][)][ns][ub][j][(][What][-][1][,][time][-][4][)][and][aux][(]know[-][3][,][Do][-][1][)][ns][ub][j][(][know][-][3][,][you][-][2][)][root][(][ROOT][-][0][,][know][-][3][)][d][obj][(][is][-][7][,][what][-][4][)][det][(][time][-][6][,][the][-][5][)][ns]ub[j][(][is][-][7][,][time][-][6][)][c][comp][(][know][-]...
```

**Quantile 3** (max=94.53, pos=[6, 7, 8, 9, 10])
```
SBAR-Suborginate[clause][|-][WH][NP][-][Wh][-][noun][phrase][|][\][-][WP][-][Wh][-][pron][oun][|][\-][What][\-][S][-][Simple][declarative][clause][\-][VP][-][Verb][phrase][|-][VB][Z][-][Verb][,][3][rd][person][singular][present][|][\][-][is][\-][NP][-][Noun][phrase][|-][DT][-][Determin][er][|][\][-]the[\-][NN][-][Noun][,][singular][or][mass][\-]time[the]applicationhasabuildinjavascriptinterpreter,...
```

**Quantile 3** (max=87.04, pos=[8, 9, 14, 17, 18])
```
view><bos>Q:in[spite][of]everyoneplayingorin[spite]ofplaying[1][.][In][spite]ofeveryoneplayingwell,welostthegame[.][2].[In]spiteofplayingwell,welost[the][game][.][Which][is][better][?][I][prefer][2][#.][I][think]["][everyone]["][and]["][we]["][are][the][same][in][this][sentence][.][A][:][Your]understanding[of][your][two][sentences][is][correct][.]["][Everyone]["][is][implied][in][the][second][sent...
```

**Quantile 2** (max=86.25, pos=[7, 8, 9, 10, 11])
```
-7)Botharewhat[-][queries][,][and][both][contain]["][time]["][as][a][nominal][subject][.][The][latter][also][contains]["][you]["][as][a][nominal][subject][,][but][I][think][expressions][like]["][do]you[know][",]["][can]you[please]tell[me][",][etc][.][can][be][removed][based][on]heuristics[.]Youwillfind[the][Stanford]Parserhelpfulforthisapproach.Theyalsohavethisonlinedemo,ifyouwanttoseesomemoreexam...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2701 |
| score_embedding | 0.0875 |
| score_fuzz | 0.5167 |
| score_detection | 0.5417 |
| explanation_semantic_sim | 0.4506 |

### Position: (0.5024, 0.2788)
### Distances: ngram=4.145, context=4.15, noisy=4.3244
### Current: **missed_context** (margin: 0.005)

### Your Tag: _____________

---

## Feature 8169 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gemini-flash-2.5, Quality: 0.5233)
> as i said or mentioned

### Activation Examples
**Quantile 3** (max=106.59, pos=[19, 20, 21, 70])
```
Ijustdonotbelievethebudgetcanbebalancedjustonreducingthesocialprogramsalone.[Like][I][said],ifwedonotgettothemiddle,thenthefutureoftheUSAwillnotbeagoodone.Agreed,butthatdoesn'texcuseignoringanddenyingtheneedforadditionalsecurityevenafterseveralrequestsforit.[I]agreethattheapproachneedstobeincreasedtaxrevenuecombinedwithspendingcuts.However,thiscanbedonebydoingawaywithloopholesratherthanraisingthet...
```

**Quantile 3** (max=105.1, pos=[29, 105, 106, 107, 108])
```
opportunitytostudyinaquitegoodschool,butnowthingshavechangedandtheonlywayoutofthisisformyGrandma'todo[as]mymotherandtrytomakeitbettersomewhereoutthecountry,maybeinUSA,whereIwasborn.That'swhyIspeakinEnglish,evenifit'shardformetodoit,'causeI'velivedalmostmywholelifehereinColombia.Unfortunately,wecan'tgowithher,'cause[as][I][say][before],there'snomoneyandshecan'tstay,'causeshemay
```

**Quantile 2** (max=97.03, pos=[81, 82, 83])
```
justthrowtherouterinthetrashandgetanewone.Iknow,itmightcostyousomemoney,butitistheonlywayyoucanbesureithasnotsomehowpersistedonthedevice.Justconsidertherouterasbrokenbeyondrepair.<bos>Thursday,November10,2011Ephesus,Rhodes,Gythionand1dayinRome[As][I][write]thiswearealreadyinLondonandsoononourwaytoAfrica.Thesecondhalfofourcruisewentfartooquicklyasweenjoyedmyparentsandalltheluxuriestheshiphadtooffer...
```

**Quantile 2** (max=95.61, pos=[19, 20, 21, 22, 23])
```
water,energy,mineralsandaccesstothosecommodities(alliances,sealanes,etc.).[As][I][have][mentioned][before],considerthetradeenabledbythereservecurrency(thedollar):[we]print/createmoneyoutofthinairandexchangethisforoil,commodities,electronics,etc.Ifthisisn’tthegreatesttradeonEarth–exchangingpaperforrealstuff–whatis?While[I][am]sympathetictothestrictlyfinancialarguments[that]predicthyper-inflationand...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.65 |
| score_embedding | 0.3508 |
| score_fuzz | 0.5 |
| score_detection | 0.4 |
| explanation_semantic_sim | 0.44 |

### Position: (0.4986, 0.2642)
### Distances: ngram=3.9532, context=3.9585, noisy=4.6701
### Current: **noisy_activation** (margin: 0.0053)

### Your Tag: _____________

---

## Feature 10849 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (gpt-4o-mini, Quality: 0.4542)
>  phrases indicating temporal context or timing

### Activation Examples
**Quantile 3** (max=102.58, pos=[72, 73])
```
’shiring“abigmistake,”andtoplobbyistforthecompany,BobQuinn,hasretired.Quinnwasaleaderinopposingnetneutrality.AT&TalsopaidCohentogetapprovalforits$85billionmergerwithTimeWarner.DrugmakerNovartisagreedthatits$1.2millioncontractwithCohenwas“amistake.”Reports[as][of]nowshowthatCohenwaspaid$2.95millionthroughEssentialConsultants,theshellcompanyCohensetuptofunnelhushmoneytoStormyDanielsandperhapsothers....
```

**Quantile 3** (max=99.44, pos=[5, 11, 12, 13])
```
It'samazing[to]methatStanfordare,[at][this][point],clingingtohopesforaBCSat-largebid.ShoulditreallybethishardtogettwoPac-12teamsintotheBCS?IguessthattheSECarestillhopingtheywillfield3teamsinthe10teamBCSschedule...Theinterviewer,whogoesbythehandle"moshboy",describestheintentoftheprojecthere:allIwantedtodowasgetsomewordsofinsightoutofafewindependentvideogamedevelopersthatweren’tknowntoputmanyoftheir...
```

**Quantile 2** (max=88.17, pos=[17, 18, 19, 20, 23])
```
XV:SER).Serenic’smarketcapof$3.18million[(][as][of][January]2[7][th][,]201[2])waslessthanitscashpositionof$4.03million(as[of]Q2,2012).Thecompanyhasnodebt.Clickhereformoreinformation.SXCHealth,alongsideUS-basedcompaniessuchasMedcoandCaremark,isaleaderinthePharmacyBenefitManagementspace.PBM’sprocessandpayprescriptiondrugclaimsandactasanintermediarybetweenthehealthcaresystemandtheclaimant.Thespacehas...
```

**Quantile 2** (max=87.89, pos=[37, 89, 98, 99, 100])
```
followingdecadeortwoorthree?Howdidthoseforecastsmeasureup?Ihadtoanswerthatquestionformyselfbyre-readingwhatIwroteinthepastaboutthefuture,before[writing]mylatestbook.ReadFREESAMPLEofTheTruthaboutAlmostEverything.Soyoucanjudgeforyourself,hereareloadsofpredictionsImadeinthepast-andthebookinwhichtheyweremadeplusdate.Everyoneoftheseisalreadya[reality]orlookslikeitsooncouldbe,[as][of][August]2[0]1[5]......
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.375 |
| score_embedding | 0.2333 |
| score_fuzz | 0.5833 |
| score_detection | 0.475 |
| explanation_semantic_sim | 0.4128 |

### Position: (0.5209, 0.3012)
### Distances: ngram=4.012, context=3.5903, noisy=3.5841
### Current: **missed_context** (margin: 0.0061)

### Your Tag: _____________

---

## Feature 10007 (boundary: boundary_missed_ngram_noisy_activation)

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

## Feature 7538 (boundary: boundary_missed_ngram_missed_context)

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

## Feature 7003 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4242)
> Abbreviations, acronyms, and shortened forms of words, often used in technical, scientific, or formal contexts, and sometimes used as prefixes or suffixes.

### Activation Examples
**Quantile 3** (max=104.23, pos=[22, 70, 83, 87])
```
="Natrag";"comaccountkitioscountrycodetitle"="[Od]aberitesvojudržavu";"comaccountkitiosphoneloginphonenumberplaceholder"="Broj";"comaccountkitiosphonelogintext"="[Do]dirnite%1$@kakobisteSMS-om[do]bilipotvrdu[od]FacebookovaalataAccountKit.%2$@vampolakšavaregistracijuspomoćuFacebookovetehnologije,alinemorateimatikorisnički
```

**Quantile 3** (max=87.51, pos=[104, 105])
```
CLAIM,DAMAGESOROTHERLIABILITY,WHETHER//INANACTIONOFCONTRACT,TORTOROTHERWISE,ARISINGFROM,OUTOFORIN//CONNECTIONWITHTHESOFTWAREORTHEUSEOROTHERDEALINGSINTHESOFTWARE.////@generated//"comaccountkitaccountverified"="Korisničkiračunpotvrđen!";"comaccountkitbuttonbegin"="Započni";"comaccountkitbuttoncancel"="[Od][ust]ani";"comaccountkitbuttonconfirm"="Potvrdi";"
```

**Quantile 2** (max=58.82, pos=[50, 51, 61])
```
$add(ascii(gen,style=cbind('h',style)))options(asciiType="pandoc")r$backend<-"pandoc"r$format<-"html"r$create()And[od][t]output:resultr$format<-"[odt]"r$create()<bos>ImmunohistochemicalstudyofdeltaandmuopioidreceptorsonsynapticglomeruliwithsubstanceP-positivecentralterminalsinchickendorsalhorn.InanattempttoclarifythemechanismunderlyingtheregulationofthereleaseofsubstanceP(SP)fromthecentralaxonterm...
```

**Quantile 2** (max=58.45, pos=[93, 94])
```
**loc1****loc2****loc3**---------------------------------1Aa**aa****aa**2**Aa****aa**Aa3**aa**aa**aa**4**Aa****AA****aa**---------------------------------Withascii::Reportyoucouldeasilyconvertititpdf,[od][t]orhtml.Justtryit:)SmalldemowithHTMLoutput:resultr<-Report$new()r$add(section("Demo"))r
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.65 |
| score_embedding | 0.0267 |
| score_fuzz | 0.5583 |
| score_detection | 0.6083 |
| explanation_semantic_sim | 0.3751 |

### Position: (0.4972, 0.2905)
### Distances: ngram=4.1418, context=4.2094, noisy=4.1376
### Current: **noisy_activation** (margin: 0.0042)

### Your Tag: _____________

---

## Feature 13618 (boundary: boundary_missed_ngram_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5042)
> Various parts of speech, including nouns, adjectives, and adverbs, often describing objects, materials, or physical properties, and sometimes indicating possession, location, or comparison.

### Activation Examples
**Quantile 3** (max=95.31, pos=[8, 9, 10, 12, 13])
```
AddtoCart:TheLiana[boot][by][Arco]ped[ico][®][-][stylish][tall][boots][with][a]secret[all][their][own][.][These][boots][appear][to][be][leather][but][are][actually][Ly][tech][®][-][a][proprietary]blend[of][Ly]cra®[and][polyurethane][that][is][water][resistant][,][light][and][breathable][.]Ly[tech][material][also][stretches][and][gently][forms][to][the][foot][,][making][it][ideal][for]problemfeet,[...
```

**Quantile 3** (max=80.17, pos=[14, 15, 16, 17, 18])
```
anddoesallthethingsIwant.Plus,Ihavethissweet[leather][cover][for][it][that][makes][it][look][like][a][cool][old][hard][back][book].Hereitis:Prettysweet,huh?I[use][it][for]internet,email,videos,TV,gamesandloadsofotherstuffaswellasreading.It’sjustthebestthingever,technology-wise.ButIdidn’talwaysreadebooksontheMiniandIuseseveralappsevennow.OtherpeopleI’vespokentouseavarietyofdevicesandallswearbythem....
```

**Quantile 3** (max=71.81, pos=[42, 43, 47, 48, 49])
```
tocustomisetheinformationyouseeonthedisplayCompactMulti-FunctionSteeringWheelThenewgenerationPeugeoti-Cockpit®includedintheall-newPeugeot3008SUVfeaturesacompact[steering][wheel]forwithMist[ral][full][-][grain][leather][and][stitch][detailing][for][a][deluxe][,][comfortable][finish].The[steering][wheel][has][been]developed[by]Peugeotengineerstocreateoptimalvisibilityfortheinstrumentdisplaysfeatured...
```

**Quantile 2** (max=69.04, pos=[58, 68, 69, 70, 71])
```
mouthlikeanescapingslug.Andherbulgingeyes,staringglassyandcoldasMichellebegantoscream.LightfromthebedsidelampcastClara’sshadowacrossthewalllikeapuppetplay,glintedoffthemetallegsoftheupturnedchairbeneath.Iboughtherthat[belt],Michellethought,asshestaredatthe[worn][black][leather][biting][deep]intotheblue-tingedfleshofClara’sneck[,]andshedrewbreathtoscreamagain.IgotawonderfulsurpriseonSaturdaywhenafe...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.7253 |
| score_embedding | 0.1175 |
| score_fuzz | 0.575 |
| score_detection | 0.575 |
| explanation_semantic_sim | 0.4177 |

### Position: (0.5005, 0.274)
### Distances: ngram=4.0284, context=4.0281, noisy=4.371
### Current: **noisy_activation** (margin: 0.0003)

### Your Tag: _____________

---

## Feature 4683 (boundary: boundary_missed_context_noisy_activation)

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

## Feature 2697 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.4975)
> Prepositions and articles often precede nouns, while conjunctions and adverbs often connect clauses or phrases, and sometimes function words like \"the\", \"a\", \"to\", \"of\", \"in\", \"or\", \"and\", \"are\", \"is\", \"for\", \"with\", \"on\", \"at\", \"by\", \"from\", \"between\", \"into\", \"like\", \"over\", \"after\", \"before\", \"under\", \"above\", \"inside\", \"outside\", \"against\", \"during\", \"including\", \"within\", \"without\", \"until\", \"since\", \"like\", \"such\", \"so\", \"some\", \"any\", \"all\", \"both\", \"each\", \"few\", \"more\", \"most\", \"other\", \"others\", \"another\", \"this\", \"that\", \"these\", \"those\", \"its\", \"my\", \"your\", \"his\", \"her\", \"our\", \"their\", \"mine\", \"yours\", \"hers\", \"ours\", \"theirs\", \"myself\", \"yourself\", \"himself\", \"herself\", \"itself\", \"ourselves\", \"yourselves\", \"themselves\", \"be\", \"is\", \"are\", \"am\", \"been\", \"being\", \"have\", \"has\", \"had\", \"do\", \"does\", \"did\", \"will\", \"would\", \"shall\", \"should\", \"can\", \"could\", \"may\", \"might\", \"must\", \"shall\", \"should\", \"will\", \"would\", \"can\", \"could\", \"may\", \"might\", \"must\", \"ought\", \"shall\", \"should\", \"will\", \"would\", \"can\", \"could\", \"may\", \"might\", \"must\", \"ought\", \"shall\", \"should\", \"will\", \"would\", \"can\", \"could\", \"may\", \"might\", \"must\", \"ought\", \"shall\", \"should\", \"will\", \"would\", \"can\", \"could\", \"may\", \"might\", \"must\", \"ought\", \"shall\", \"should\", \"will\", \"would\", \"can\", \"could\", \"may\", \"might\", \"must\", \"ought\", \"shall\", \"should\", \"will\", \"would\", \"can\", \"could\", \"may\", \"might\", \"must\", \"ought\", \"shall

### Activation Examples
**Quantile 3** (max=100.39, pos=[80, 88, 90, 105, 106])
```
preferabletouseanapproximationmodelthatatleastfitsthecalibrationdatapoints.)Thesedeficienciescanbepartiallyremediedbyusinganon-linear(e.g.,quadratic)functionalapproximation(Ref.7).Thisapproachmitigates,butdoesnoteliminate,thelimitationsoflinearmodels.Theparameterrangelimitoffunctional(linearornon-linear)approximationmodelscanbeextendedbythemethod[of]xe2x80x9[c]range[splitting]xe2x80x9d,whereinthef...
```

**Quantile 3** (max=83.13, pos=[10, 11, 12, 13, 14])
```
systemwasalreadydecidedearlyonwhenitwasbroken[into][two][main][components][;][the]device[independent][component][(]the[logical]layerofthedevice)whichrequiredittobewritteninahigh-levellanguagesuchasCandthehardware-[dependent](thephysicallayerofthedevice)componentinwhichthedevicedrivermodelmapsthelow-leveldatastructuresofthephysicaldevice[to]high[level]datastructuresofthelogicaldevice.ThereforetheUn...
```

**Quantile 2** (max=75.52, pos=[49, 50, 51, 52, 53])
```
process,theywerecoatedwithgoldandanalyzedwithFieldEmissionScanningElectronMicroscope(Hittachis4160,Stanford,CA,USA).AnoperatornotawareoftheexperimentalsetupanalyzedthemembraneswithSEM.Eachmembranewas[divided][into][four][intellectual][parts]underSEM[with]×300magnificationsand[one]imagewas[taken][from][each]part.Anothertwoobserverstotallyunawareoftheexperiment[counted][the]cellson[each]imageandifth...
```

**Quantile 2** (max=75.31, pos=[27, 31, 32, 33, 34])
```
limitingdistributionofthemomentsatthetrue$\beta{0}$.Toformulateconditionsforthisresultwedecomposethedifferencebetweentheleftand[right]-handsides[into][several][rema][inders].Let$\phi(z,\gamma,\lambda)=\phi(z,\beta{0},\gamma,\lambda),$$\bar{\phi}(\gamma,\lambda)=E[\phi(z{i},\gamma,\lambda)],$and$\bar{m}(\gamma)=E[m(z{i},\beta{0},\gamma)],$sothat$\bar{\psi}(\gamma,\lambda)=\bar{m}(\gamma)+\bar{\phi}...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 1.0 |
| score_embedding | 0.1508 |
| score_fuzz | 0.5583 |
| score_detection | 0.55 |
| explanation_semantic_sim | 0.4265 |

### Position: (0.5027, 0.2564)
### Distances: ngram=4.2528, context=4.2547, noisy=5.1194
### Current: **missed_context** (margin: 0.0019)

### Your Tag: _____________

---

## Feature 10542 (boundary: boundary_missed_context_noisy_activation)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.6667)
> Special characters and symbols used for formatting, citations, and mathematical expressions, often serving as delimiters or indicators of specific information.

### Activation Examples
**Quantile 3** (max=81.32, pos=[13, 79])
```
endofalistIhaveanArrayListinJava:{"deleteItem","createitem","exportitem","deleteItems","createItems"}Iwanttomoveallstringwhichcontainsdeletetotheendofthelist,soIwouldgetthenext:{"createitem","exportitem","createItems","deleteItem","deleteItems"}[`]Icancreatetwosublists-oneforthewordswhichcontainthe'delete'word,andonefortheothers,andthenmergethem,butIsearchforamoreefficientway.A:Usecustom
```

**Quantile 3** (max=79.86, pos=[1, 2])
```
[<code>][<]ahref="../../../java.base/java/lang/Object.html#clone()">clone</a>,<ahref="../../../java.base/java/lang/Object.html#equals(java.lang.Object)">equals</a>,<ahref="../../../java.base/java/lang/Object.html#finalize()">finalize</a>,<ahref="../../../java.base/java/lang/Object.html#getClass()">getClass</a>,<ahref="../../../java.base/java/lang/Object.html#hashCode()">hashCode</a>,<ahref="../../
```

**Quantile 2** (max=68.14, pos=[91, 92, 96, 98, 103])
```
uniquetrainy)returnpredictionsdeftransformclassesinyvectors(yclasses,uniquetrainy):cyr=[uniquetrainy[predictedindex]forpredictedindexinyclasses]predictions=np.array(float(cyr))returnpredictionsIgotthisErrormessage:IndexError:onlyintegers,slices[(`][:`]),ellipsis[(`]...[`),]numpy.newaxis[(`]None`)andintegerorbooleanarraysarevalidindicesA:Itseemsthatyclassesholdsvaluesthat
```

**Quantile 2** (max=66.75, pos=[78, 94, 98, 108, 114])
```
go-openapi/errors""github.com/go-openapi/strfmt""github.com/go-openapi/swag""github.com/go-openapi/validate")//RegistrationViaAPIResponseTheResponseforRegistrationFlowsviaAPI////swagger:modelregistrationViaApiResponsetypeRegistrationViaAPIResponsestruct[{]//identity//Required:trueIdentity*Identity[`]json:"identity["`]//sessionSession*Session[`]json:"session,omitempty["`]//TheSessionToken////
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.2765 |
| score_embedding | 0.5317 |
| score_fuzz | 0.5167 |
| score_detection | 0.35 |
| explanation_semantic_sim | 0.5457 |

### Position: (0.5053, 0.2582)
### Distances: ngram=4.3514, context=4.3499, noisy=5.1283
### Current: **noisy_activation** (margin: 0.0014)

### Your Tag: _____________

---

## Feature 13737 (boundary: boundary_missed_ngram_missed_context)

### Best Explanation (Meta-Llama-3.1-70B-Instruct-AWQ-INT4, Quality: 0.5075)
> Abbreviations, acronyms, and partial words often representing names, organizations, technical terms, or common phrases.

### Activation Examples
**Quantile 3** (max=130.68, pos=[5, 6, 15, 16, 25])
```
part)include:[Asp][h]ondyliaclavata–leafgall[Asp][h]ondyliapilosa–leafgall[Asp]hondyliavillosa–leafgall[Asp][h]ondyliabarbata–leafgall[Asp][h]ondyliadigitata–leafgall[Asp]hondyliadiscalis–leafgall[Asp][h]ondyliasilicula–leafgall[Asp]hondyliafabalis–leafgallAsp[h]ondyliabullata–stemgall[Asp]hondyliaresinosa–stemgall[Asp][h]ondyliafoliosa–stemgallAsp[h]ondyliaauripila–stemgall
```

**Quantile 3** (max=125.49, pos=[1, 2, 3])
```
See[ASP][.][NET]MembershipChangePasswordcontrol-Needtocheckforpreviouspasswordforsamplecodeofhowtodothis.<bos>Interregionalcorrelationofcerebralglucosemetabolisminunmedicatedschizophrenia.Toinvestigatemetabolicrelationshipsbetweendifferentbrainregionsinschizophrenia,wemeasuredregionalbrainmetabolismusingpositronemissiontomography(PET)and[18F]fluorodeoxyglucose(FDG)in15unmedicatedschizophrenicpatie...
```

**Quantile 2** (max=111.0, pos=[67, 100])
```
usingascalefixedtothewall(PersonmåttPEM136,Hultafors,Sweden),andthebodymassindex(BMI)wascalculated.Waistcircumference(WC),tothenearest0.5cm,wasmeasuredinastandingexhaledposition,withameasuring-tape(KirchnerWilhelm,[Asp]berg,Germany)placedonthepatient'sskinbetweenthelowerribandtheiliaccrest.###SystolicandDiastolicBloodPressure(S[BP],DBP){#sec009}TheSBPandDBPweremeasuredinmmHgaccordingtoguidelines\[...
```

**Quantile 2** (max=109.36, pos=[103, 104, 105, 108, 109])
```
,butunsurewhattouse.Anyonedonethisbeforeorsimilarandknowswhatishouldgettoachievewhatiwant?Manythanks!A:YouneedanUSBtoTTLcable.TTLindicates3.3Vcompatibility."Normal"USBtoRS-232cablesworkwithhighervoltagesandcandamagethePi.ExampleUSBtoTTLcable:https://www.adafruit.com/product/954<bos>Q:Whatframeworksareavailablein[ASP][.][NET]Core([ASP][.]NET5)applications?Ihaveseenvariousframeworkstargetedinproject...
```

### Metrics
| Metric | Value |
|--------|-------|
| intra_feature_sim | 0.875 |
| score_embedding | 0.2575 |
| score_fuzz | 0.5583 |
| score_detection | 0.5 |
| explanation_semantic_sim | 0.4554 |

### Position: (0.5011, 0.2486)
### Distances: ngram=3.9091, context=3.9156, noisy=4.8695
### Current: **missed_ngram** (margin: 0.0066)

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
