const tools = (function () {
    // PRIVATE
    let highlightLR, selectedLR, defaultStyle, draw;
    const eventName = "tools-componentLoaded";
    const create = new Event(eventName);
    document.addEventListener(eventName, () => console.log("Tools lib loaded !"))
    document.dispatchEvent(create);

    const highlightStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: "#ffa43b",
            width: 5
        })
    });

    return {
        // PUBLIC
        refLineStyle: (labels) => {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: "black",
                    width: 2
                }),
                text: labels ? labels : null
            })
        },
        view: () => mviewer.getMap().getView(),
        setZoom: (z) => tools.view().setZoom(z),
        getZoom: () => tools.view().getZoom(),
        getMvLayerById: (id) => mviewer.getMap().getLayers().getArray().filter(l => l.get('mviewerid') === id)[0],
        zoomToOGCLayerExtent: () => {
            const options = maddog.getCfg("config.options.defaultLayerZoom");
            if (!mviewer.getLayer(options.layer)) return;
            let url = options.url || mviewer.getLayer(options.layer).layer.getSource().getUrl() ;
            if (options.type === "wms" && !options.url) {
                url = url + "?service=WMS&version=1.1.0&request=GetCapabilities&namespace=" + options.namespace;
            }
            if (options.type === "wfs" && !options.url) {
                url = url.replace("wms","wfs") + "?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application/json&typeName=" + options.layer;
            }
            fetch(url).then(response => options.type === "wms" ? response.text() : response.json())
            .then(function (response) {
                let reader = options.type === "wms" ? new ol.format.WMSCapabilities() : new ol.format.GeoJSON();
                let extent;
                if (options.type === "wms") {
                    const infos = reader.read(response);
                    extent = _.find(infos.Capability.Layer.Layer, ["Name", options.layer]).BoundingBox[0].extent;
                }
                if (options.type === "wfs") {
                    const layerExtentInit = new ol.source.Vector();
                    const features = reader.readFeatures(response);
                    layerExtentInit.addFeatures(features);
                    extent = layerExtentInit.getExtent();
                }
                maddog.bbox = extent;
                // wait 2000 ms correct map size to zoom correctly
                tools.zoomToExtent(maddog.bbox, {duration: 0}, 2000);
                if (options.asHomeExtent) {
                    mviewer.zoomToInitialExtent = () => {
                        tools.zoomToExtent(maddog.bbox);
                    };
                }
            })
        },
        zoomToJSONFeature: (jsonFeature, startProj, endProj) => {
            const outConfig = endProj && startProj ? {
                dataProjection: startProj,
                featureProjection: endProj
            } : {}
            const features = new ol.format.GeoJSON({
                defaultDataProjection: startProj
            }).readFeatures(jsonFeature, outConfig);
            if (features.length) {
                tools.zoomToExtent(features[0].getGeometry().getExtent());
            }
        },
        zoomToExtent: (extent, props, time) => {
            // NEED REPROJECTION FOR EMPRISE !
            const overlay = tools.getMvLayerById("featureoverlay");
            const duration = 1000;
            const displayTime = 3000;
            const fit = () => {
                mviewer.getMap().getView().fit(
                    extent,
                    {
                        size: mviewer.getMap().getSize(),
                        padding: [100, 100, 100, 100],
                        duration: duration,
                        ...props
                    }
                );
            };

            if (!extent || !overlay) return;
            if (time) {
                setTimeout(() => fit(), time);
            } else {
                fit();
            }
            setTimeout(() => overlay.getSource().clear(), displayTime);
        },
        featureToOverlay: (feature) => {
            const overlay = tools.getMvLayerById("featureoverlay").getSource();
            overlay.clear();
            overlay.addFeature(feature);
        },
        init: (component) => {
            this.getCfg = (i) => _.get(mviewer.customComponents[component], i);
        },
        /**
         * Check or wait a plugin or lib
         * @param {string} id 
         * @param {boolean} ready 
         * @returns {function}
         */
        waitPlugin: (id, ready) => new Promise((resolve, reject) => {

            if (!ready) {
                document.addEventListener(`${id}-componentLoaded`, resolve(true));
            } else {
                resolve(true)
            }
        }),
        /**
         * Init Fuse Search by layer
         * @returns 
         */
        initFuseSearch: (id) => wfs2Fuse.initSearch(
            getCfg(`config.options.${id}.url`),
            getCfg(`config.options.${id}.fuseOptions`),
            id,
            (d) => {
                maddog[id] = d
            }
        ),
        getGFIUrl: (coordinate, layerId, callback) => {
            const viewResolution = /** @type {number} */ (mviewer.getMap().getView().getResolution());
            const urlSite = mviewer.getLayer(layerId).layer.getSource().getFeatureInfoUrl(
                coordinate,
                viewResolution,
                'EPSG:3857', {
                    'INFO_FORMAT': 'application/json'
                }
            );
            if (urlSite) {
                axios.get(urlSite)
                    .then((response) => response.data.features ? response.data.features[0] : [])
                    .then((feature) => {
                        callback(feature);
                    });
            }
        },
        findCommuneOnClick: (coordinate) => {
            tools.getGFIUrl(coordinate, "communewithsite", (feature) => {
                if (feature) {
                    tools.zoomToJSONFeature(feature, "EPSG:3857");
                }
            });
        },
        findSiteOnClick: (coordinate) => {
            tools.getGFIUrl(coordinate, "sitebuffer", (feature) => {
                if (feature) {
                    tools.setIdSite(feature.properties.idsite, feature.properties.namesite);
                    tools.zoomToJSONFeature(feature, "EPSG:3857");
                    // init service
                    tools.initServicebyMenu();
                } else {
                    maddog.idsite = null;
                    tools.findCommuneOnClick(coordinate);
                }
            });
        },
        onClickAction: () => {
            if (maddog.singleclick) return;
            maddog.singleclick = true;
            mviewer.getMap().on('singleclick', function (evt) {
                // don't use actions to avoid conflict with TDC draw refline
                if (maddog.drawStart) return;
                document.getElementById("siteName").innerHTML = "Aucun site sélectionné !";
                tools.findSiteOnClick(evt.coordinate);
                // enable feature selection for some features only
                mviewer.getMap().forEachFeatureAtPixel(
                    evt.pixel,
                    f => {
                        if (selectedLR && f.get("ogc_fid") == selectedLR.get("ogc_fid")) return;
                        if (f.getProperties()) {
                            selectedLR = f;
                            const props = f.getProperties();
                            if (!PP_WPS.hidden) {
                                prfUtils.getPrfByProfilAndIdSite(props.idsite, props.idtype);   
                            }
                        }
                    },
                    {
                        hitTolerance: 10,
                        layerFilter: (l) => ["refline"].includes(l.getProperties().mviewerid)
                    }
                );
            });
        },
        highlightFeature: () => {
            mviewer.getMap().on('pointermove', function (e) {
                if (highlightLR) {
                    highlightLR.setStyle(defaultStyle[highlightLR.getId()]);
                    delete defaultStyle[highlightLR.getId()];
                    highlightLR = null;
                }
                mviewer.getMap().forEachFeatureAtPixel(
                    e.pixel,
                    (f, layer) => {
                        highlightLR = f;
                        defaultStyle = {...defaultStyle, [f.getId()]: f.getStyle()};
                        highlightLR.setStyle(highlightStyle);
                        return true;
                    },
                    {
                        hitTolerance: 10,
                        layerFilter: (l) => ["refline"].includes(l.getProperties().mviewerid)
                        
                    }
                );
            });
        },
        setIdSite: (idsite, namesite) => {
            maddog.idsite = idsite;
            document.getElementById("siteName").innerHTML = _.capitalize(namesite);
            document.getElementById("WPSnoselect").style.display = "none";
            document.getElementById("btn-wps-tdc").classList.remove("disabled");
            document.getElementById("btn-wps-pp").classList.remove("disabled");
            document.getElementById("btn-wps-mnt").classList.remove("disabled");
        },
        initServicebyMenu: () => {
            tdcUtils.tdcReset(true);
            if (maddog.idsite && !TDC_WPS.hidden) {
                tdcUtils.getReferenceLine(maddog.idsite);
                tdcUtils.getTDCByIdSite(maddog.idsite);
            }
            if (maddog.idsite && !PP_WPS.hidden) {
                prfUtils.getPrfRefLines(maddog.idsite);
            }
        },
        showHideMenu: (ele) => {
            ele.hidden = !ele.hidden;
            selectWPS.hidden = !selectWPS.hidden;
            tools.initServicebyMenu();
            if (TDC_WPS.hidden) {
                tdcUtils.tdcReset(true);
            }
            if (PP_WPS.hidden) {
                prfUtils.prfReset(true);
            }
        },
        downloadBlob: (content, filename, contentType) => {
            // Create a blob
            var blob = new Blob([content], { type: contentType });
            var url = URL.createObjectURL(blob);
          
            // Create a link to download it
            var pom = document.createElement('a');
            pom.href = url;
            pom.setAttribute('download', filename);
            pom.click();
        },
        addInteraction: (sourceLayer) => {
            let feature;

            sourceLayer.clear();

            draw = new ol.interaction.Draw({
                source: sourceLayer,
                type: 'LineString'
            });

            draw.on('drawend', function (evt) {
                // need to clone to keep default draw line
                feature = evt.feature.clone();
                // reproject draw line to work with WPS
                feature.getGeometry().transform("EPSG:3857", "EPSG:2154");
                // WPS only works if properties is not null
                feature.setProperties({ time: new Date().toISOString() });
                // create JSON
                const featureJSON = new ol.format.GeoJSON({ defaultDataProjection: "EPSG:2154" }).writeFeature(feature);
                // set drawRadial config
                maddog.setDrawRadialConfig({
                    drawReferenceLine: `<![CDATA[{"type":"FeatureCollection","features":[${featureJSON}]}]]>`
                });
                // close draw interaction
                mviewer.getMap().removeInteraction(draw);
                $("#coastlinetrackingBtn").show();
            });

            mviewer.getMap().addInteraction(draw);
        },
        btnDrawline: (btn, idLayer, deactivate) => {
            const sourceLayer = mviewer.getLayer(idLayer).layer.getSource();
            if (btn.className == "btn btn-default btn-danger" || deactivate) {
                btn.className = "btn btn-default";
                btn.innerHTML = "<span class='glyphicon glyphicon-pencil' aria-hidden='true'></span> Dessiner"; 
                sourceLayer.clear();  
                info.enable(); 
                maddog.setDrawRadialConfig({
                    drawReferenceLine: null
                });
                maddog.drawStart = false;
                // close draw interaction
                mviewer.getMap().removeInteraction(draw);
                $("#coastlinetrackingBtn").show();
            } else {
                btn.className = "btn btn-default btn-danger";
                btn.innerHTML = "<span class='glyphicon glyphicon-remove' aria-hidden='true'></span> Annuler";
                maddog.drawStart = true;
                tools.addInteraction(sourceLayer);
                info.disable();
            }
        }
    }
})();