/**
 * This file is usefull to manage MNT panels interaction and MNT WMS layer.
 */
const mntUtils = (function () {
    // PRIVATE
    // This allow to display a browser console message when this file is correctly loaded
    const eventName = "mntUtils-componentLoaded";
    var create = new Event(eventName);
    document.addEventListener(eventName, () => console.log("MNT Utils lib loaded !"));
    // required and waiting by maddog.js PromisesAll
    document.dispatchEvent(create);
    /**
     * Get MNT WMS openLayers source
     * @returns ol.source
     */
    const mntSrc = () => mviewer.getLayer("mnt").layer.getSource();
    /**
     * Add or change MNT WMS request params like location CQL or TIME param.
     * @param {any} newParams 
     */
    const changeSourceParams = (newParams) => {
        mntSrc().updateParams({ ...mntSrc().getParams(), ...newParams });
        mntSrc().refresh();
    };

    const getBaseLayerById = (map, id) => map.getLayers().getArray().filter(i => i.getProperties().blid === id)
    // PUBLIC
    return {
        // dates from postgREST table
        dates: [],
        init: () => {
            // create selector options
            mntUtils.getDates();
            mntUtils.siteChange();
            mviewer.getLayer("mnt").layer.setVisible(true);
            mntSrc().refresh();
            mntUtils.onBaseLayerChange();
        },
        /**
         * To reset MNT
         * @param {boolean} close 
         */
        mntReset: (close) => {
            const params = mntSrc().getParams();
            delete params["CQL_FILTER"];
            delete params["TIME"];
            mntUtils.removeMap();
            mntUtils.getDates();
            mntToolbar.hidden = true;
        },
        /**
         * On close MNT panel
         */
        onClose: () => {
            mntUtils.removeMap();
            mviewer.getLayer("mnt").layer.setVisible(false);
            mntSrc().refresh();
        },
        /**
         * Get dates from PostgREST api and construct select dates list.
         * Will display first date by default.
         * @returns Array
         */
        getDates: () => {
            if (!maddog.idsite) return [];
            // get all dates by idsite
            fetch(`${maddog.getCfg("config.options.postgrestapi")}/sitemntdate?code_site=eq.${maddog.idsite}`)
                .then(response => response.text())
                .then(response => {                    // dates are already ordered by date type in postgresql view
                    let datesJson = JSON.parse(response);
                    // add dates to list
                    mntUtils.createMntMultiSelect(datesJson);
                    // update layer with first list value by default
                    mntUtils.updateLayer();
                })
        },
        /**
         * get mnt source
         */
        getMNTSource: mntSrc,
        /**
         * On selecte date value change
         * @param {Object} d - from event select element 
         * @returns update WMS layer with correct id site or correct date
         */
        dateChange: (d) => {
            mntUtils.date = d?.value;
            if (!maddog.idsite || ! mntUtils.date) {
                return mntUtils.mntReset();
            };
            // create CQL - use searchParametersURL API
            mntUtils.updateLayer();
        },
        /**
         * Update WMS MNT params according selected site and selected date (first by default)
         */
        updateLayer: () => {
            changeSourceParams({
                CQL_FILTER: `location like '%${maddog.idsite}%'`
            });
            if (mntUtils.date) {
                changeSourceParams({ time:  mntUtils.date });
            }
        },
        /**
         * Will be trigger on site click event
         * @returns update WMS layer with correct id site or correct date
         */
        siteChange: () => {
            mntUtils.getDates();
            // change custom layer params to add CQL
            if (!maddog.idsite) return;
            mntUtils.updateLayer();
        },
        addMap: () => {
            // change height to 50% id="map"
            // add second div with bottom 0
            mntUtils.removeMap();
            const newMap = document.createElement('div');
            newMap.id = "mntMap";
            newMap.classList.add("map")
            map.appendChild(newMap);
            map.style = "height:50%";
            mviewer.getMap().updateSize();
            // create ol map
            mntUtils.map = new ol.Map({
                target: 'mntMap',
                layers: [
                  new ol.layer.Tile({
                    source: new ol.source.OSM()
                  })
                ],
                view: mviewer.getMap().getView()
            });
            mntUtils.syncBaseLayer();
        },
        onBaseLayerChange: (e) => {
            document.getElementById("basemapslist")
                .addEventListener(
                    "click",
                    (e) => mntUtils.syncBaseLayer()
                )
        },
        removeMap: () => {
            if (document.getElementById("mntMap")) {
                mntMap.remove();
                mntUtils.map = null;
            }
            map.style = "height:100%";
            mviewer.getMap().updateSize();
        },
        
        syncBaseLayer: () => {
            if (!mntUtils.map) {
                return;
            }
            // get all baseLayers from initial mv map
            mntUtils.map.getLayers().getArray().forEach(e => mntUtils.map.removeLayer(e))
            const BL = mviewer.getMap().getLayers().getArray().filter(i => i.getProperties().blid === mviewer.getActiveBaseLayer())[0].getSource();
            const activeBL = new ol.layer.Tile({
                visible: true,
                source: BL,
                blid: mviewer.getActiveBaseLayer()
            });
            mntUtils.map.addLayer(activeBL)
        },
        map: null,
        onParamChange: (e) => {
            maddog.setConfig({
                [e.id]: e.type === "number" ? parseFloat(e.value) : e.value
            }, "compareRasterMNTConfig");
            $("#mntCompareBtn").show();
        },
        /**
        * Create bootstrap-multiselect for beach profile UI
        */
        createMntMultiSelect: (dates) => {
            mntToolbar.hidden = false;
            // clean multi select if exists
            $(selectorMnt).empty();
            // create multiselect HTML parent
            let multiSelectComp = document.createElement("select");
            multiSelectComp.id = "mntMultiselect";
            multiSelectComp.setAttribute("multiple", "multiple");
            selectorMnt.appendChild(multiSelectComp);
            // create multiselect
            $("#mntMultiselect").multiselect({
                enableFiltering: true,
                filterBehavior: 'value',
                allSelectedText: 'Tous',
                nonSelectedText: 'Rechercher une date',
                templates: {
                    li: `
                        <li>
                            <a class="labelDateLine">
                                <label style="display:inline;padding-right: 5px;"></label>
                            </a>
                        </li>`
                },
                onChange: () => {
                    mntUtils.changeDates();
                    mntUtils.manageError("Vous devez choisir au moins 2 dates !", '<i class="fas fa-exclamation-circle"></i>');
                },
            });
            // create options with multiselect dataprovider
            let datesOptions = dates.map((d, i) =>
                ({
                    label: moment(d.date_survey, "YYYY-MM-DDZ").format("DD/MM/YYYY"),
                    value: d.date_survey
                })
            );
            // insert options into multiselect
            $("#mntMultiselect").multiselect('dataprovider', datesOptions);
            // change picto color according to chart and legend
            $("#selectorPrf").find(".labelDateLine").each((i, x) => {
                $(x).find(".dateLine").css("color", dates[i].color);
            });
            $("#mntMultiselect").multiselect("updateButtonText");

            mntUtils.manageError("Vous devez choisir au moins 2 dates !", '<i class="fas fa-exclamation-circle"></i>');
        },
        manageError: () => {
            const datesSelected = $('#mntMultiselect option:selected').length;
            const displayError = datesSelected !== 2;
            // manage trigger wps button
            mntCompareBtn.disabled = displayError;
            panelMNTParam.hidden = displayError;
            alertMntParams.hidden = !displayError;
        },
        changeDates: () => {
            let datesSelected = $('#mntMultiselect option:selected');
            if (!datesSelected.length) {
                datesSelected = [null, null];
            };
            maddog.setConfig({
                initDate: moment(datesSelected[0].value, "YYYY-MM-DD").format("YYYYMMDD"),
                dateToCompare: datesSelected[1] ? moment(datesSelected[1].value, "YYYY-MM-DD").format("YYYYMMDD") : null
            }, "compareRasterMNTConfig");
            mntUtils.updateLayer();
        },
        multiSelectBtn: (action) => {
            $("#mntMultiselect").multiselect(action, false);
            mntMultiselect.changeDates();
            mntUtils.manageError("Vous devez choisir au moins 2 dates !", '<i class="fas fa-exclamation-circle"></i>');
        }
    }
})()