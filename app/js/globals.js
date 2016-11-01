const path = require('path')
const fs = require('fs')
const request = require('request')
const YAML = require('yamljs')

// Initialise globals, sanity check filesystem
module.exports = (callback) => {
  let _G = {} // Globals. Paths, screenEid, etc.

  _G.packageJson = require(path.resolve(__dirname, '..', '..', 'package.json'))

  _G.codes = {
    CONFIGURATION_DOWNLOAD_IN_PROGRESS: 'CONFIGURATION_DOWNLOAD_IN_PROGRESS',
    CONFIGURATION_FILE_NOT_PRESENT: 'CONFIGURATION_FILE_NOT_PRESENT',
    CONFIGURATION_NOT_AVAILABLE_YET: 'CONFIGURATION_NOT_AVAILABLE_YET',
    CONFIGURATION_FILE_OK: 'CONFIGURATION_FILE_OK',
    CONFIGURATION_FETCH_FAILED: 'CONFIGURATION_FETCH_FAILED',
    CONFIGURATION_NOT_UPDATED: 'CONFIGURATION_NOT_UPDATED',
    CONFIGURATION_UPDATED: 'CONFIGURATION_UPDATED',
    DOM_RENDERED: 'DOM_RENDERED',
    MEDIA_TYPE_URL: 'URL',
    MEDIA_TYPE_IMAGE: 'Image',
    MEDIA_TYPE_VIDEO: 'Video',
    MEDIA_TYPE_AUDIO: 'Audio'
  }
  _G.HOME_PATH = path.resolve(__dirname, '..', '..', 'local')
  if (!fs.existsSync(_G.HOME_PATH)) {
    fs.mkdirSync(_G.HOME_PATH)
  }

  _G.META_DIR = path.resolve(_G.HOME_PATH)
  // _G.META_DIR = path.resolve(_G.HOME_PATH, 'sw-meta')
  if (!fs.existsSync(_G.META_DIR)) {
    fs.mkdirSync(_G.META_DIR)
  }
  fs.readdirSync(_G.META_DIR).forEach((downloadFilename) => {
    if (downloadFilename.split('.').pop() !== 'download') { return }
    let downloadFilePath = path.resolve(_G.META_DIR, downloadFilename)
    console.log('Unlink ' + downloadFilePath)
    let result = fs.unlinkSync(downloadFilePath)
    if (result instanceof Error) {
      console.log("Can't unlink " + downloadFilePath, result)
    }
  })

  _G.MEDIA_DIR = path.resolve(_G.HOME_PATH, 'sw-media')
  if (!fs.existsSync(_G.MEDIA_DIR)) {
    fs.mkdirSync(_G.MEDIA_DIR)
  }
  fs.readdirSync(_G.MEDIA_DIR).forEach((downloadFilename) => {
    if (downloadFilename.split('.').pop() !== 'download') { return }
    let downloadFilePath = path.resolve(_G.MEDIA_DIR, downloadFilename)
    console.log('Unlink ' + downloadFilePath)
    let result = fs.unlinkSync(downloadFilePath)
    if (result instanceof Error) {
      console.log("Can't unlink " + downloadFilePath, result)
    }
  })

  _G.playbackLog = fs.createWriteStream(path.resolve(_G.HOME_PATH, 'playback.log'))
  _G.playbackLog.setDefaultEncoding('utf8')
  _G.playbackLog.log = function(text) {
    let now = new Date().toJSON().slice(11).replace(/[TZ]/g, ' ')
    _G.playbackLog.write(now + text + '\n')
  }

  _G.playbackLog.log(_G.packageJson.productName + ' version ' + _G.packageJson.version)

  function closeWithMessage (message) {
    window.alert(message)
    const {shell} = require('electron')
    shell.showItemInFolder(_G.credentialsFilePath)
    window.close()
    throw new Error(message)
  }

  function writeCredentials (_G) {
    let confYaml = YAML.stringify(
      {
        "SCREEN_EID": _G.SCREEN_EID,
        "SCREEN_KEY": _G.SCREEN_KEY,
        "DISPLAY_NUM": _G.DISPLAY_NUM,
        "SKIP_TASKBAR": _G.SKIP_TASKBAR,
        "DEV_MODE": _G.DEV_MODE
      }
    )
    console.log('Writing to ' + _G.credentialsFilePath + ': ' + confYaml)
    try {
      fs.writeFileSync(_G.credentialsFilePath, confYaml)
    } catch (e) {
      closeWithMessage('Credentials file not writable!')
      return {}
    }
  }

  function readCredentials (_G) {
    try {
      let data = fs.readFileSync(_G.credentialsFilePath, 'utf8')
      return YAML.parse(data)
    }
    catch (e) {
      closeWithMessage('Credentials file corrupted!')
      return {}
    }
  }

  _G.credentialsFilePath = path.resolve(_G.HOME_PATH, 'screen.yml')
  console.log('Credentials at ' + _G.credentialsFilePath)
  try {
    fs.accessSync(_G.credentialsFilePath, fs.R_OK)
  }
  catch (e) {
    _G.SCREEN_EID = 0
    _G.SCREEN_KEY = ''
    _G.DISPLAY_NUM = 2
    _G.SKIP_TASKBAR = true
    _G.DEV_MODE = false
    writeCredentials(_G)
  }

  try {
    fs.accessSync(_G.credentialsFilePath, fs.R_OK)
  }
  catch (e) {
    closeWithMessage('Credentials file not accessible!')
  }

  let credentials = readCredentials(_G)
  for (ix in credentials) {
    _G[ix] = credentials[ix]
  }
  console.log(credentials)
  // _G.SCREEN_EID = credentials.SCREEN_EID
  // _G.SCREEN_KEY = credentials.SCREEN_KEY
  // _G.DISPLAY_NUM = credentials.DISPLAY_NUM
  // _G.DEV_MODE = credentials.DEV_MODE
  _G.SCREENWERK_API = 'https://swpublisher.entu.eu/configuration/'

  _G.setScreenEid = (_G, eid) => {
    let credentials = readCredentials(_G)
    _G.SCREEN_EID = eid
    writeCredentials(_G)
  }

  if (_G.SCREEN_EID) {
    _G.tempConfFilePath = path.resolve(_G.META_DIR, _G.SCREEN_EID + '.json.download')
    _G.confFilePath = path.resolve(_G.META_DIR, _G.SCREEN_EID + '.json')
    callback(null, _G)
  }
  else {
    let screenEidDiv = document.getElementById('screenEid')
    let screenEidInput = document.getElementById('screenEidInput')
    let screenEidResult = document.getElementById('screenEidResult')

    screenEidResult.innerHTML = 'Please provide valid screen ID'
    screenEidDiv.style.display = 'block'
    screenEidInput.addEventListener('keyup', (e) => {
      if (/^\d+$/.test(screenEidInput.value)) {
        screenEidResult.innerHTML = screenEidInput.value
        if (e.keyCode === 13) {
          screenEidResult.innerHTML = 'Looking up ' + screenEidInput.value + ' ...'

          let responseData = ''
          request(_G.SCREENWERK_API + screenEidInput.value)
          .on('response', (res) => {
            if (res.statusCode !== 200) {
              screenEidResult.innerHTML = JSON.stringify({not200:res}, null, 4)
            }
          })
          .on('error', (err) => {
            screenEidResult.innerHTML = JSON.stringify({error:err}, null, 4)
            // callback(err)
          })
          .on('data', (d) => {
            responseData = responseData + d
          })
          .on('end', () => {
            let parsedData = JSON.parse(responseData)
            if (parsedData.error) {
              screenEidResult.innerHTML = JSON.stringify(parsedData.error, null, 4)
            }
            else if (parsedData.screenEid) {
              _G.SCREEN_EID = parsedData.screenEid
              _G.tempConfFilePath = path.resolve(_G.META_DIR, _G.SCREEN_EID + '.json.download')
              _G.confFilePath = path.resolve(_G.META_DIR, _G.SCREEN_EID + '.json')
              writeCredentials(_G)
              callback(null, _G)
              screenEidDiv.style.display = 'none'
            }
          })
        }
      }
      else if (screenEidInput.value.length > 0) {
        screenEidResult.innerHTML = 'Digits only, please.'
      }
      else {
        screenEidResult.innerHTML = 'Please provide valid screen ID'
      }
    })
    screenEidInput.focus()
  }
}
