const tdcUtils = (function () {
    // PRIVATE
    // This allow to display a browser console message when this file is correctly loaded
    const eventName = "tdcUtils-componentLoaded";
    var create = new Event(eventName);
    document.addEventListener(eventName, () => console.log("TDC Utils lib loaded !"));
    // required and waiting by maddog.js PromisesAll
    document.dispatchEvent(create);

    return {
        getReferenceLine: (idsite) => {
            // search reference line as first step and required WPS infos
            const lineRefUrl = maddog.server + '/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=maddog%3Alineref&outputFormat=application%2Fjson&CQL_FILTER=idsite=';
            axios.get(`${lineRefUrl}'${idsite}' AND idtype LIKE 'TDC1'`)
                .then(lineRef => {
                    maddog.refLine = lineRef.data;
                    return lineRef.data.features ? lineRef.data.features[0] : []
                })
                .then(feature => `<![CDATA[{"type":"FeatureCollection","features":[${JSON.stringify(feature)}]}]]>`)
                // from reference line, we get radiale
                .then(geojson => maddog.setConfig({
                    referenceLine: geojson
                }, "drawRadialConfig"))
                .then(() => tdcUtils.getTDCByIdSite(idsite))
                .then(() =>
                    // get WPS params for this reference line
                    fetch(`${maddog.getCfg("config.options.postgrestapi")}/wpstdcconf?id_site=eq.${idsite}`)
                    .then(response => response.text())
                    .then(wpsParams => {
                        const p = JSON.parse(wpsParams)[0];
                        if (p?.radial_length) {
                            radialLength.value = p?.radial_length;
                            tdcUtils.onParamChange(radialLength);
                        }
                        if (p?.radial_distance) {
                            radialDistance.value = p?.radial_distance;
                            tdcUtils.onParamChange(radialDistance);
                        }
                    })
                );
        },
        getTDCByIdSite: (idsite) => {
            // next, we get TDC usefull to call coastline tracking WPS
            const tdcUrl = maddog.server + "/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=maddog:tdc&outputFormat=application/json&CQL_FILTER=idsite=";
            axios.get(`${tdcUrl}'${idsite}'`)
                // get TDC and calculate legend and char color
                .then(tdc => {
                    maddog.charts.tdc = {
                        ...tdc.data,
                        features: tdc.data.features.map(f =>
                            ({
                                ...f,
                                properties: {
                                    ...f.properties,
                                    color: "#" + Math.floor(Math.random() * 16777215).toString(16)
                                }
                            })
                        )
                    };
                    // display multiselect from TDC dates
                    tdcUtils.setTdcFeatures(tdc.data.features)
                    tdcUtils.createTDCMultiSelect();
                    // display TDC to map
                    tdcUtils.changeTdc()
                    return tdc
                })
        },
        drawRefLine: () => {
            if (!maddog.refLine) return;
            let layer = mviewer.getLayer("refline").layer;
            layer.getSource().clear();
            // display radiales on map with EPSG:3857
            let features = new ol.format.GeoJSON({
                defaultDataProjection: 'EPSG:2154'
            }).readFeatures(maddog.refLine, {
                dataProjection: 'EPSG:2154',
                featureProjection: 'EPSG:3857'
            });
            features.forEach(f => f.setStyle(tools.refLineStyle()));
            layer.getSource().addFeatures(features);
        },
        drawTDC: (featureJSON) => {
            if (_.isEmpty(featureJSON)) return;

            let layerTdc = mviewer.getLayer("tdc").layer;

            // display TDC on map with EPSG:3857
            let featuresTdc = new ol.format.GeoJSON({
                defaultDataProjection: 'EPSG:2154'
            }).readFeatures(featureJSON, {
                dataProjection: 'EPSG:2154',
                featureProjection: 'EPSG:3857'
            });
            featuresTdc.forEach(f => {
                return f.setStyle(new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: f.get("color"),
                        width: 2
                    })
                }))
            });
            layerTdc.getSource().clear();
            layerTdc.getSource().addFeatures(featuresTdc);
        },
        radialesStyle: (feature) => {
            let last = feature.getGeometry().getCoordinates()[0];
            let first = feature.getGeometry().getCoordinates()[1];
            return (f, res) => {
                const displayLabel = res < mviewer.getLayer("sitebuffer").layer.getMinResolution();
                const labelOffset = res > 4 ? -20 : Math.round(res > 3.5 ? res / -2 * 10 : -30);
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: "black",
                        width: 2
                    }),
                    text: displayLabel ? new ol.style.Text({
                        font: '18px Roboto',
                        text: `${f.get('name')}`,
                        placement: 'point',
                        rotation: -Math.atan((last[1] - first[1]) / (last[0] - first[0])),
                        textAlign: 'start',
                        offsetX: labelOffset,
                        offsetY: 3,
                        textBaseline: "bottom",
                        fill: new ol.style.Fill({
                            color: 'black'
                        })
                    }) : null
                })
            }
        },
        getRadiales: (r) => {
            // on affiche la radiale sur la carte
            let layer = mviewer.getLayer("radiales").layer;
            // save with EPSG:2154 for getDistance WPS
            maddog.radiales2154 = new ol.format.GeoJSON({
                defaultDataProjection: 'EPSG:2154'
            }).readFeatures(r.responseDocument);

            // display radiales on map with EPSG:3857
            let features = new ol.format.GeoJSON({
                defaultDataProjection: 'EPSG:2154'
            }).readFeatures(r.responseDocument, {
                dataProjection: 'EPSG:2154',
                featureProjection: 'EPSG:3857'
            });

            features.forEach(f => f.setStyle((tdcUtils.radialesStyle(f))));

            layer.getSource().clear();
            layer.getSource().addFeatures(features);
            // on garde la radiale en config pour le coastline tracking
            maddog.setConfig({
                radiales: `<![CDATA[${JSON.stringify(r.responseDocument)}]]>`
            }, "coastLinesTrackingConfig");
            // on zoom sur l'extent de la radiale
            tools.zoomToExtent(layer.getSource().getExtent());

            // we call coastLineTracking now
            wps.coastLineTracking(maddog.coastLinesTrackingConfig);

            // display ref line
            if (!mviewer.getLayer("drawRefline").layer.getSource().getFeatures().length) {
                tdcUtils.drawRefLine();
            }
        },
        createPlotlyLine: (dataDate, labels, field, color) => {
            const line = {
                name: moment(dataDate.date).format("DD/MM/YYYY"),
                x: labels,
                type: "scatter",
                mode: 'lines',
                line: {
                    color: color
                },
                width: 3
            };
            // sort by radiale name for each date
            if (!dataDate.data.length) {
                // create reference line with 0 values for each labels
                line.y = labels.map(() => 0);
                line.line = {
                    ...line.line,
                    dash: 'dashdot',
                    width: 4
                };
            } else {
                line.y = labels.map((radialeName, i) => {
                    const radialeValues = _.find(dataDate.data, ["radiale", radialeName])
                    return _.isEmpty(radialeValues) ? null : radialeValues[field];
                });
            }
            return line;
        },
        tdcDistanceChart: (dates) => {
            let labels;
            let selected = maddog.charts.coastLines.result;
            $("#tdcDistanceChart").remove();
            const div = document.createElement("div");
            div.id = "tdcDistanceChart";
            document.getElementById("tdcGraph1").appendChild(div);
            const titleGraph = "<p><b>Évolution de la cinématique du trait de côte (en mètres) </b><br><i>pour le site sélectionné</i><p>";
            document.getElementById("titleChart1").innerHTML = titleGraph;

            // get dates from selection or every dates
            if (!_.isEmpty(dates)) {
                selected = selected.filter(r => dates.includes(r.date))
            };
            // get uniq labels
            labels = _.uniq(_.spread(_.union)(selected.map(s => s.data.map(d => d.radiale)))).sort();
            labels = _.sortBy(labels);
            // create one line by date
            const lines = selected.map((s, i) => {
                return tdcUtils.createPlotlyLine(s, labels, "cumulateDist", s.color)
            });
            // create chart
            const axesFont = {
                font: {
                    family: 'Roboto',
                    size: 13,
                    color: '#555'
                }
            }
            Plotly.newPlot('tdcDistanceChart', lines, {
                showlegend: false,
                autosize: true,
                title: {
                    text: `Date de référence : ${maddog.tdcReference}`,
                    font: {
                        family: 'Roboto',
                        size: 14
                    },
                    y: 0.9
                },
                xaxis: {
                    title: {
                        standoff: 40,
                        text: 'Radiales',
                        pad: 2,
                        ...axesFont,
                    },
                    showgrid: false,
                    autorange: true,
                    tickfont: {
                        color: "rgb(107, 107, 107)",
                        size: 11
                    },
                    tickmode: "auto",
                    nticks: 30,
                    ticks: "outside",
                    tickwidth: 1,
                    tickangle: 40,
                    ticklen: 5,
                    showticklabels: true,
                    showline: true,
                    showgrid: false
                },
                yaxis: {
                    gridcolor: "#555",
                    title: {
                        text: 'Distance (m)',
                        ...axesFont
                    },
                    autorange: true,
                    showgrid: false,
                    zeroline: false,
                    autotick: true,
                    ticks: 'outside',
                    gridcolor: "#afa8a7",
                    showticklabels: true,
                    showline: false,
                }
            }, {
                responsive: true,
                modeBarButtonsToAdd: [{
                    name: 'Export SVG',
                    icon: {
                        width: 500,
                        height: 600,
                        path: "M384 128h-128V0L384 128zM256 160H384v304c0 26.51-21.49 48-48 48h-288C21.49 512 0 490.5 0 464v-416C0 21.49 21.49 0 48 0H224l.0039 128C224 145.7 238.3 160 256 160zM255 295L216 334.1V232c0-13.25-10.75-24-24-24S168 218.8 168 232v102.1L128.1 295C124.3 290.3 118.2 288 112 288S99.72 290.3 95.03 295c-9.375 9.375-9.375 24.56 0 33.94l80 80c9.375 9.375 24.56 9.375 33.94 0l80-80c9.375-9.375 9.375-24.56 0-33.94S264.4 285.7 255 295z"
                    },
                    click: function(gd) {
                        Plotly.downloadImage(gd, {
                            format: 'svg'
                        })
                    }
                }, {
                    name: 'Export CSV',
                    icon: {
                        width: 500,
                        height: 600,
                        path: "M224 0V128C224 145.7 238.3 160 256 160H384V448C384 483.3 355.3 512 320 512H64C28.65 512 0 483.3 0 448V64C0 28.65 28.65 0 64 0H224zM80 224C57.91 224 40 241.9 40 264V344C40 366.1 57.91 384 80 384H96C118.1 384 136 366.1 136 344V336C136 327.2 128.8 320 120 320C111.2 320 104 327.2 104 336V344C104 348.4 100.4 352 96 352H80C75.58 352 72 348.4 72 344V264C72 259.6 75.58 256 80 256H96C100.4 256 104 259.6 104 264V272C104 280.8 111.2 288 120 288C128.8 288 136 280.8 136 272V264C136 241.9 118.1 224 96 224H80zM175.4 310.6L200.8 325.1C205.2 327.7 208 332.5 208 337.6C208 345.6 201.6 352 193.6 352H168C159.2 352 152 359.2 152 368C152 376.8 159.2 384 168 384H193.6C219.2 384 240 363.2 240 337.6C240 320.1 231.1 305.6 216.6 297.4L191.2 282.9C186.8 280.3 184 275.5 184 270.4C184 262.4 190.4 256 198.4 256H216C224.8 256 232 248.8 232 240C232 231.2 224.8 224 216 224H198.4C172.8 224 152 244.8 152 270.4C152 287 160.9 302.4 175.4 310.6zM280 240C280 231.2 272.8 224 264 224C255.2 224 248 231.2 248 240V271.6C248 306.3 258.3 340.3 277.6 369.2L282.7 376.9C285.7 381.3 290.6 384 296 384C301.4 384 306.3 381.3 309.3 376.9L314.4 369.2C333.7 340.3 344 306.3 344 271.6V240C344 231.2 336.8 224 328 224C319.2 224 312 231.2 312 240V271.6C312 294.6 306.5 317.2 296 337.5C285.5 317.2 280 294.6 280 271.6V240zM256 0L384 128H256V0z"
                    },
                    click: function(gd) {
                        tools.downloadBlob(maddog.tdcCSV, 'export.csv', 'text/csv;charset=utf-8;')
                    }
                }]

            });

        },
        tdcTauxChart: (dates) => {
            let labels;
            let selected = maddog.charts.coastLines.result;
            $("#tdcTauxChart").remove();
            const div = document.createElement("div");
            div.id = "tdcTauxChart";
            document.getElementById("tdcGraph2").appendChild(div);
            const titleGraph = "<p><b>Taux d'évolution du trait de côte (m/an)</b><br><i>pour le site sélectionné</i><p>";
            document.getElementById("titleChart2").innerHTML = titleGraph;

            // get dates from selection or every dates
            if (!_.isEmpty(dates)) {
                selected = selected.filter(r => dates.includes(r.date))
            };
            // get uniq labels
            labels = _.uniq(_.spread(_.union)(selected.map(s => s.data.map(d => d.radiale)))).sort();
            labels = _.sortBy(labels);
            // create one line by date
            const lines = selected.map((s, i) => {
                return tdcUtils.createPlotlyLine(s, labels, "tauxRecul", s.color)
            });
            // create chart
            const axesFont = {
                font: {
                    family: 'Roboto',
                    size: 13,
                    color: '#555'
                }
            }
            Plotly.newPlot('tdcTauxChart', lines, {
                showlegend: false,
                autosize: true,
                xaxis: {
                    title: {
                        standoff: 40,
                        text: 'Radiales',
                        pad: 2,
                        ...axesFont,
                    },
                    tickmode: "auto",
                    nticks: 30,
                    ticks: "outside",
                    tickwidth: 1,
                    tickangle: 40,
                    ticklen: 5,
                    showticklabels: true,
                    showline: true,
                    showgrid: false
                },
                yaxis: {
                    gridcolor: "#555",
                    title: {
                        text: 'Taux de recul (m/an)',
                        ...axesFont
                    },
                    autorange: true,
                    zeroline: false,
                    autotick: true,
                    ticks: 'outside',
                    showticklabels: true,
                    showline: false
                }
            }, {
                responsive: true,
                modeBarButtonsToAdd: [{
                    name: 'Export SVG',
                    icon: {
                        width: 500,
                        height: 600,
                        path: "M384 128h-128V0L384 128zM256 160H384v304c0 26.51-21.49 48-48 48h-288C21.49 512 0 490.5 0 464v-416C0 21.49 21.49 0 48 0H224l.0039 128C224 145.7 238.3 160 256 160zM255 295L216 334.1V232c0-13.25-10.75-24-24-24S168 218.8 168 232v102.1L128.1 295C124.3 290.3 118.2 288 112 288S99.72 290.3 95.03 295c-9.375 9.375-9.375 24.56 0 33.94l80 80c9.375 9.375 24.56 9.375 33.94 0l80-80c9.375-9.375 9.375-24.56 0-33.94S264.4 285.7 255 295z"
                    },
                    click: function(gd) {
                        Plotly.downloadImage(gd, {
                            format: 'svg'
                        })
                    }
                }, {
                    name: 'Export CSV',
                    icon: {
                        width: 500,
                        height: 600,
                        path: "M224 0V128C224 145.7 238.3 160 256 160H384V448C384 483.3 355.3 512 320 512H64C28.65 512 0 483.3 0 448V64C0 28.65 28.65 0 64 0H224zM80 224C57.91 224 40 241.9 40 264V344C40 366.1 57.91 384 80 384H96C118.1 384 136 366.1 136 344V336C136 327.2 128.8 320 120 320C111.2 320 104 327.2 104 336V344C104 348.4 100.4 352 96 352H80C75.58 352 72 348.4 72 344V264C72 259.6 75.58 256 80 256H96C100.4 256 104 259.6 104 264V272C104 280.8 111.2 288 120 288C128.8 288 136 280.8 136 272V264C136 241.9 118.1 224 96 224H80zM175.4 310.6L200.8 325.1C205.2 327.7 208 332.5 208 337.6C208 345.6 201.6 352 193.6 352H168C159.2 352 152 359.2 152 368C152 376.8 159.2 384 168 384H193.6C219.2 384 240 363.2 240 337.6C240 320.1 231.1 305.6 216.6 297.4L191.2 282.9C186.8 280.3 184 275.5 184 270.4C184 262.4 190.4 256 198.4 256H216C224.8 256 232 248.8 232 240C232 231.2 224.8 224 216 224H198.4C172.8 224 152 244.8 152 270.4C152 287 160.9 302.4 175.4 310.6zM280 240C280 231.2 272.8 224 264 224C255.2 224 248 231.2 248 240V271.6C248 306.3 258.3 340.3 277.6 369.2L282.7 376.9C285.7 381.3 290.6 384 296 384C301.4 384 306.3 381.3 309.3 376.9L314.4 369.2C333.7 340.3 344 306.3 344 271.6V240C344 231.2 336.8 224 328 224C319.2 224 312 231.2 312 240V271.6C312 294.6 306.5 317.2 296 337.5C285.5 317.2 280 294.6 280 271.6V240zM256 0L384 128H256V0z"
                    },
                    click: function(gd) {
                        tools.downloadBlob(maddog.tdcCSV, 'export.csv', 'text/csv;charset=utf-8;')
                    }
                }]

            });
            document.dispatchEvent(wps.stopEvent);
        },
        tdcPlotyChart: (dates) => {
            // create or re generate chart div
            tdcUtils.tdcDistanceChart(dates);
            tdcUtils.tdcTauxChart(dates);
        },
        setTdcFeatures: (features) => {
            const tdcGeojson = `<![CDATA[{"type":"FeatureCollection","features":[${JSON.stringify(features)}]}]]>`;
            maddog.setConfig({
                tdc: tdcGeojson
            }, "coastLinesTrackingConfig");
            $("#drawRadialBtn").prop('disabled', features.length < 2);
        },
        orderDates: (selected) => {
            selected = selected.map(s => ({
                ...s.properties,
                isodate: new Date(moment(s.properties.creationdate, "YYYY-MM-DDZ").format("YYYY-MM-DD"))
            }));
            return _.orderBy(selected, (o) => {
                return moment(o.isodate);
            }, ['asc'])
        },
        changeTdc: () => {
            $("#coastlinetrackingBtn").show();
            let selected = [];
            // clean graph
            if (document.getElementById("tdcTauxChart")) {
                tdcTauxChart.remove();
            }
            if (document.getElementById("tdcDistanceChart")) {
                tdcDistanceChart.remove();
            }
            // get checked TDC
            $('#tdcMultiselect option:selected').each((i, el) => {
                selected.push(maddog.charts.tdc.features.filter(feature => feature.properties.creationdate === $(el).val())[0]);
            });
            // create coastline tracking param
            tdcUtils.setTdcFeatures(selected);
            tdcUtils.drawTDC({
                ...maddog.charts.tdc,
                features: selected
            });
            if (maddog.charts.coastLines && maddog.charts.coastLines.result.length) {
                let csv = _.flatten(maddog.charts.coastLines.result.filter(c => c.data.length).map(x => x.data));
                maddog.tdcCSV = Papa.unparse(csv);
            }
            selected = tdcUtils.orderDates(selected);
            // set legend content
            if (!selected.length) {
                return tdcUtils.changeLegend($(`<p>Aucune date n'a été sélectionnée !</p>`));
            }
            const legendHtml = selected.map(s => {
                let color = "color:" + s.color;
                return `<li>
                    <a class="labelDateLine">
                        <label style="display:inline;padding-right: 5px;">${new Date(s.isodate).toLocaleDateString()}</label>
                        <i class="fas fa-minus" style='${color}'></i>
                    </a>
                </li>`
            }).join("");
            tdcUtils.changeLegend($(`<p>Date(s) sélectionnée(s):</p><ul class="nobullet">${legendHtml}</ul>`));
        },
        changeLegend: (content) => {
            panelDrag?.display();
            panelDrag?.clean();
            panelDrag?.change(content);
        },
        manageError: () => {
            const displayError = $('#tdcMultiselect option:selected').length < 2;
            // manage trigger wps button
            coastlinetrackingBtn.disabled = displayError;
            panelTDCParam.hidden = displayError;
            alertTdcParams.hidden = !displayError;
        },
        multiSelectBtn: (action) => {
            $("#tdcMultiselect").multiselect(action, false);
            tdcUtils.changeTdc();
            tdcUtils.manageError();
        },
        createTDCMultiSelect: () => {
            // get dates from WPS result
            const orderedData = tdcUtils.orderDates(maddog.charts.tdc.features);
            const dates = orderedData.map(e => e.creationdate);
            // clean multi select if exists
            $(selectorTdc).empty()
            // create multiselect HTML parent
            let multiSelectComp = document.createElement("select");
            multiSelectComp.id = "tdcMultiselect";
            multiSelectComp.setAttribute("multiple", "multiple");
            selectorTdc.appendChild(multiSelectComp);
            // create multiselect
            $("#tdcMultiselect").multiselect({
                enableFiltering: true,
                filterBehavior: 'value',
                nonSelectedText: 'Rechercher une date',
                templates: {
                    li: `
                        <li>
                            <a class="labelDateLine">
                                <label style="display:inline;padding-right: 5px;"></label>
                                <i class="dateLine fas fa-minus"></i>
                            </a>
                        </li>`
                },
                onChange: () => {
                    tdcUtils.changeTdc();
                    tdcUtils.manageError();
                },
            });
            // create options with multiselect dataprovider
            let datesOptions = dates.map((d, i) =>
                ({
                    label: moment(d, "YYYY-MM-DD").format("DD/MM/YYYY"),
                    value: d
                })
            );
            // insert options into multiselect
            $("#tdcMultiselect").multiselect('dataprovider', datesOptions);
            // change picto color according to chart and legend
            $("#selectorTdc").find(".labelDateLine").each((i, x) => {
                $(x).find(".dateLine").css("color", orderedData[i].color);
            });
            tools.multiSelectBtnReset('tdcMultiselect', 'selectAll', tdcUtils)
            tdcUtils.manageError();
        },
        tdcReset: (cleanTdcLayer) => {
            $("#coastlinetrackingBtn").show();
            $("#tdcMultiselect").multiselect("refresh");
            $('.tdcNavTabs a[href="#tdcTabDate"]').tab('show');
            mviewer.getLayer("refline").layer.getSource().clear();
            mviewer.getLayer("tdc").layer.getSource().clear();
            mviewer.getLayer("radiales").layer.getSource().clear();
            panelDrag.clean();
            panelDrag.hidden();
            if (!cleanTdcLayer) {
                tdcUtils.getTDCByIdSite(maddog.idsite);
            }
            // deactivate draw btn if activ
            tools.btnDrawline(btnDrawRefLine, 'drawRefline', true);

            // reset config
            let { radialLength, radialDirection, radialDistance } = tdcUtils.defaultParams;
            document.getElementById("radialLength").value = radialLength;
            document.getElementById("radialDirection").value = radialDirection;
            document.getElementById("radialDistance").value = radialDistance;

            maddog.setConfig({
                referenceLine: '',
                drawReferenceLine: '',
                ...tdcUtils.defaultParams
            }, "drawRadialConfig");
        },
        initTDC: () => {
            tdcUtils.tdcReset();
        },
        onParamChange: (e) => {
            maddog.setConfig({
                [e.id]: e.type === "number" ? parseInt(e.value) : e.value
            }, "drawRadialConfig");
            $("#coastlinetrackingBtn").show();
        },
        defaultParams: {
            radialLength: 100,
            radialDistance: 50,
            radialDirection: true
        }
    }
})();