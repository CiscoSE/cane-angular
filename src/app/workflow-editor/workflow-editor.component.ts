import { Component, AfterViewInit, OnInit, ViewChildren, QueryList, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { FormGroup, FormBuilder, FormArray, Validators, AbstractControl, FormControl } from '@angular/forms';
import { CodeEditorComponent } from '../code-editor/code-editor.component';

import * as dot from 'dot-object';
import { CaneService } from '../cane/cane.service';
import { Observable } from 'rxjs';
import { MessageService } from '../message/message.service';

const VALID_NAME = /^(\$*[a-zA-Z]+)(\.(([a-zA-Z]+)|(\d+\.[a-zA-Z]+)))*(\.\d+)?$/;
const VALID_QUERY = /^(([$]*[\w-]+(=[\w-]+))?(&[$]*[\w-]+(=[\w-' ]+))*)?$/;

@Component({
  selector: 'app-workflow-editor',
  templateUrl: './workflow-editor.component.html',
  styleUrls: ['./workflow-editor.component.scss'],
  animations: [
    trigger('openClose', [
      state('opened', style({
        visibility: 'visible',
        maxHeight: '500px'
      })),
      state('closed', style({
        visibility: 'hidden',
        maxHeight: '0px'
      })),
      state('*', style({
        visibility: 'hidden',
        maxHeight: '0px'
      })),
      transition('opened=>closed', animate('750ms')),
      transition('closed=>opened', animate('750ms 194ms')),
      transition('opened=>*', animate('750ms')),
      transition('*=>opened', animate('750ms 194ms'))
    ]),
  ]
})

export class WorkflowEditorComponent implements AfterViewInit, OnInit {
  @ViewChildren('requestEditor') requestEditors: QueryList<CodeEditorComponent>;
  @ViewChildren('queryEditor') queryEditors: QueryList<ElementRef>;
  @ViewChildren('responseEditor') responseEditors: QueryList<CodeEditorComponent>;

  fakeApis = {
    "webex" : {
      "listRooms": {verb: "GET", api: "https://api.ciscospark.com/v1/rooms"},
      "createRoom": {verb: "POST", api: "https://api.ciscospark.com/v1/rooms"},
      "deleteRoom": {verb: "DELETE", api: "https://api.ciscospark.com/v1/rooms/{roomId}"}
    },
    "meraki": {
      "newAdmin": {verb: "POST", api: "https://api.meraki.com/api/v0/organizations/{organizationId}/admins"},
      "newNetwork": {verb: "POST", api: "https://api.meraki.com/api/v0/organizations/{organizationId}/networks"},
      "newOrg": {verb: "POST", api: "https://api.meraki.com/api/v0/organizations"}
    }
  }

  stateTracker = {
    activeParamDrop: null,
    activeFieldDrop: null,
    openEditor: null,
    steps: []
  };

  public workflowEditor: FormGroup;
  public newWorkflowStep: FormGroup;
  public editWorkflowDetails: FormGroup;
  private newEditor = false;
  private editDetails = false;
  private accountList;
  private apiList;

  constructor(
    private _fb: FormBuilder,
    private changeDetector: ChangeDetectorRef,
    private caneService: CaneService,
    private messageService: MessageService) { }

  ngAfterViewInit() {
    this.changeDetector.detectChanges();
  }

  ngOnInit() {
    this.initTracker();

    this.workflowEditor = this._fb.group({
      workflowName: ['newWorkflow'],
      workflowDescription: ['New Workflow...'],
      steps: this._fb.array([
          // this.initSteps(),
      ])
    }, {
      validator: [this.validateSteps]
    });

    this.newWorkflowStep = this._fb.group({
      stepTitle: ['', Validators.required],
      stepAccount: ['', Validators.required],
      stepAPI: ['', Validators.required]
    });

    this.editWorkflowDetails = this._fb.group({
      workflowName: ['', Validators.required],
      workflowDescription: ['', Validators.required]
    });

    this.refreshDevices();
  }

  onSubmit() {
    console.log("Saving...");
    console.log(this.workflowEditor.value);
    this.saveWorkflow(this.workflowEditor.value);
  }

  initTracker() {
    this.stateTracker.steps.push({
      currentTab: 'req',
      requestWindow: 'param',
    });
  }

  initStep(title: string, account: string, api: string, apiDetail: string, verb: string) {
    return this._fb.group({
      stepTitle: [title],
      stepAccount: [account],
      stepAPI: [api],
      stepAPIDetail: [apiDetail],
      stepVerb: [verb],
      selected: [false],
      params: this._fb.array([
        // this.initParam(),
      ]),
      headers: this._fb.array([
        // this.initHeader(),
      ]),
      variables: this._fb.array([
        // this.initVariable(),
      ])
    });
  }

  initParam() {
    return this._fb.group({
      selected: [false],
      name: ['', Validators.pattern(VALID_NAME)],
      value: [''],
      paramType: [''],
      fieldType: ['']
    }, {
      validator: [this.validateGroup, this.validateType]
    });
  }

  initHeader() {
    return this._fb.group({
      selected: [false],
      name: [''],
      value: ['']
    }, {
      validator: [this.validateGroup]
    });
  }

  initVariable() {
    return this._fb.group({
      selected: [false],
      name: [''],
      value: ['']
    }, {
      validator: [this.validateGroup]
    });
  }

  debug() {
    console.log(this.workflowEditor);
  }

  isValid(step: number, name: string) {
    var control = (<FormArray>this.workflowEditor.controls['steps']).at(step).get(name) as FormArray;

    return control.valid;
  }

  validateGroup(group: FormGroup) {
    if(group) {
      var errors = {};
      
      Object.keys(group.controls).forEach((key) => {
        if(key != "selected") {
          if(group.controls[key].value == "") {
            errors[key] = "";
          }
        }
      });

      if(Object.keys(errors).length > 0) {
        return errors;
      }

      return null;
    }
  }
  
  validateType (group: FormGroup) {
    if(group) {
      var valueVal = group.controls['value'].value;
      var fieldTypeVal = group.controls['fieldType'].value;

      switch(fieldTypeVal) {
        case 'number':
          if(!isNaN(valueVal)) {
            return null;
          }
          break;
        case 'boolean':
          if(valueVal.toLowerCase() == "true" || valueVal.toLowerCase() == "false") {
            return null;
          }
          break;
        case 'string':
          return null;
      }

      return { isValid: false };
    }
  }

  validateSteps (group: FormGroup) {
    if(group) {
      var numSteps = group.controls['steps'].value.length;
      
      if(numSteps > 0) {
        return null;
      }

      return { isValid: false };
    }
  }

  addParam(index: number) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('params') as FormArray;
    control.push(this.initParam());
  }

  removeParam(index: number) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('params') as FormArray;

    for(var i = (control.controls.length - 1); i >= 0; i--) {
      if(control.at(i).get('selected').value == true) {
        control.removeAt(i);
      }
    }
  }

  addHeader(index: number) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('headers') as FormArray;
    control.push(this.initHeader());
  }

  removeHeader(index: number) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('headers') as FormArray;

    for(var i = (control.controls.length - 1); i >= 0; i--) {
      if(control.at(i).get('selected').value == true) {
        control.removeAt(i);
      }
    }
  }

  addVariable(index: number) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('variables') as FormArray;
    control.push(this.initVariable());
  }

  removeVariable(index: number) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('variables') as FormArray;

    for(var i = (control.controls.length - 1); i >= 0; i--) {
      if(control.at(i).get('selected').value == true) {
        control.removeAt(i);
      }
    }
  }

  updateParamType(step: number, param: number, value: string) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(step).get('params') as FormArray;

    control.at(param).get('paramType').setValue(value);
    this.stateTracker.activeParamDrop = "";
  }

  updateFieldType(step: number, param: number, value: string) {
    const control = (<FormArray>this.workflowEditor.controls['steps']).at(step).get('params') as FormArray;

    control.at(param).get('fieldType').setValue(value);
    this.stateTracker.activeFieldDrop = "";
  }

  addStep() {
    this.closeModal('add');

    var newTitle = this.newWorkflowStep.value.stepTitle;
    var newAccount = this.newWorkflowStep.value.stepAccount;
    var newAPI = this.newWorkflowStep.value.stepAPI
    var newAccountDetail;
    var newAPIDetail;
    var newVerb;

    this.caneService.getAccountDetail(newAccount).toPromise()
    .then(
      res=> {
        newAccountDetail = res['baseURL']
      }
    )
    .then(
      ()=> {
        this.caneService.getApiDetail(newAccount, newAPI).toPromise()
        .then(
          res=> {
            newAPIDetail = res['path'];
            newVerb = res['method']
          }
        )
        .then(
          () => {
            const control = <FormArray>this.workflowEditor.controls['steps'];
            control.push(this.initStep(newTitle, newAccount, newAPI, (newAccountDetail + newAPIDetail), newVerb));
        
            this.initTracker();
            this.newWorkflowStep.reset();
            this.changeDetector.detectChanges();
          }
        )
      }
    )
  }

  remStep() {
    const control = <FormArray>this.workflowEditor.controls['steps'];

    for(var i = (control.controls.length - 1); i >= 0; i--) {
      if(control.at(i).get('selected').value == true) {
        control.removeAt(i);
      }
    }
  }

  modifyDetails() {
    this.workflowEditor.patchValue({ workflowName: this.editWorkflowDetails.value.workflowName });
    this.workflowEditor.patchValue({ workflowDescription: this.editWorkflowDetails.value.workflowDescription });

    this.closeModal('edit');
  }

  // getDropState(index: number) {
  //   if(this.stateTracker.openEditor == index) {
  //     return 'opened';
  //   }

  //   return 'closed';
  // }

  toggleEditor(event: any, index: number) {
    if(event.target.tagName != "DIV") {
      event.stopPropagation();
      return;
    }

    if(this.stateTracker.openEditor == index) {
      this.stateTracker.openEditor = null;
    } else {
      this.stateTracker.openEditor = index;
    }
  }

  toggleParamDrop(step: number, param: number) {
    if(this.stateTracker.activeParamDrop == `${step}x${param}`) {
      this.stateTracker.activeParamDrop = null;
    } else {
      this.stateTracker.activeParamDrop = `${step}x${param}`;
    }
  }

  toggleFieldDrop(step: number, field: number) {
    if(this.stateTracker.activeFieldDrop == `${step}x${field}`) {
      this.stateTracker.activeFieldDrop = null;
    } else {
      this.stateTracker.activeFieldDrop = `${step}x${field}`;
    }
  }

  setRequestWindow(index: number, state: string) {
    this.stateTracker.steps[index].requestWindow = state;
  }

  setEditorTab(index: number, tab: string) {
    this.stateTracker.steps[index].currentTab = tab;
  }

  // updateResponse(event: Event, index: number) {
  //   console.log("Update Response Editor " + index);
  //   console.log(event);

  // }

  updateRequest(index: number) {
    var control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('params') as FormArray;
    var selectedEditor = this.requestEditors.find(editor => editor.id == index);
    var editorValue = selectedEditor.codeEditor.getSession().getValue();

    var objVal = JSON.parse(editorValue.trim());
    var bodyObj = {};
    dot.dot(objVal, bodyObj);

    var paramName = "";
    var fieldType = "";

    var queryObj = {}
    var split;

    while(control.controls.length != 0) {
      control.removeAt(0);
    }

    Object.keys(bodyObj).forEach((key) => {
      paramName = key;

      if(typeof(bodyObj[key]) == "number") {
        fieldType = "number"
      } else if(typeof(bodyObj[key]) == "boolean") {
        fieldType = "boolean"
      } else if(typeof(bodyObj[key]) == "string"){
        fieldType = "string"
      } else {
        console.log("Unkown Type: " + bodyObj[key]);
      }

      var newControl = this._fb.group({
        selected: [false],
        name: [paramName],
        descr: [''],
        paramType: ['body'],
        fieldType: [fieldType],
        value: [bodyObj[key]]
      });

      control.push(newControl);
    });

    if(this.queryEditors) {
      var selectedQuery = this.queryEditors.find(query => query.nativeElement.id == index.toString());
      var data = selectedQuery.nativeElement.value;
      split = data.split('&');

      split.forEach((item) => {
        var temp = item.split('=')
        if(temp[0] && temp[1]) {
          if(temp[0].length > 0 && temp[1].length > 0) {
            queryObj[temp[0]] = temp[1]
          }
        }
      })
    } else {
      console.log("Cannot Locate queryEditors!");
    }

    Object.keys(queryObj).forEach((key) => {
      paramName = key;

      if(!isNaN(queryObj[key])) {
        fieldType = "number"
      } else if(queryObj[key].toLowerCase() == "true" || queryObj[key].toLowerCase() == "false") {
        fieldType = "boolean"
      } else if(typeof(queryObj[key]) == "string"){
        fieldType = "string"
      } else {
        console.log("Unkown Type: " + queryObj[key]);
      }

      var newControl = this._fb.group({
        selected: [false],
        name: [paramName],
        descr: [''],
        paramType: ['query'],
        fieldType: [fieldType],
        value: [queryObj[key]]
      });

      control.push(newControl);
    });
  }

  // parseQueryString(index: number) {
  //   var control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('params') as FormArray;
  //   var paramName = "";
  //   var fieldType = "";
  //   var queryObj = {}
  //   var split;

  //   if(this.queryEditors) {
  //     var selectedQuery = this.queryEditors.find(query => query.nativeElement.id == index.toString());
  //     var data = selectedQuery.nativeElement.value;
  //     split = data.split('&');

  //     split.forEach((item) => {
  //       var temp = item.split('=')
  //       if(temp[0] && temp[1]) {
  //         if(temp[0].length > 0 && temp[1].length > 0) {
  //           queryObj[temp[0]] = temp[1]
  //         }
  //       }
  //     })
  //   } else {
  //     console.log("Cannot Locate queryEditors!");
  //   }

  //   console.log(queryObj);

  //   for(var i = 0; i < control.controls.length; i++) {
  //     if(control.controls[i].get('paramType').value == "query") {
  //       control.removeAt(i);
  //     }
  //   }

  //   Object.keys(queryObj).forEach((key) => {
  //     paramName = key;

  //     if(!isNaN(queryObj[key])) {
  //       console.log(key + " => " + (+queryObj[key]) + "(num)");
  //       fieldType = "number"
  //     } else if(queryObj[key].toLowerCase() == "true" || queryObj[key].toLowerCase() == "false") {
  //       console.log(key + " => " + queryObj[key] + "(bool)");
  //       fieldType = "boolean"
  //     } else if(typeof(queryObj[key]) == "string"){
  //       console.log(key + " => " + queryObj[key] + "(str)");
  //       fieldType = "string"
  //     } else {
  //       console.log("Unkown Type: " + queryObj[key]);
  //     }

  //     var newControl = this._fb.group({
  //       selected: [false],
  //       name: [paramName],
  //       descr: [''],
  //       paramType: ['query'],
  //       fieldType: [fieldType],
  //       value: [queryObj[key]]
  //     });

  //     control.push(newControl);
  //   });
  // }

  paramToRAW(index: number) {
    var control = (<FormArray>this.workflowEditor.controls['steps']).at(index).get('params') as FormArray;
    var selectedQuery = this.queryEditors.find(query => query.nativeElement.id == index.toString());
    var selectedEditor = this.requestEditors.find(editor => editor.id == index);
    var queryArray = [];
    var tgt = {};

    for(var i = (control.controls.length - 1); i >= 0; i--) {
      if(control.at(i).get('paramType').value == 'body') {
        var key = control.at(i).get('name').value;
        var value;

        switch(control.at(i).get('fieldType').value) {
          case 'string':
            value = control.at(i).get('value').value;
            break;
          case 'number':
            value = +(control.at(i).get('value').value);
            break;
          case 'boolean':
            if(String((control.at(i).get('value').value)).toLowerCase() == 'true') {
              value = true;
            } else {
              value = false;
            }
            break;
          default:
            console.log("Unknown fieldType!")
        }

        tgt[key] = value;
      } else if(control.at(i).get('paramType').value == 'query') {
        var queryTemp = control.at(i).get('name').value;
        queryTemp += '=';
        queryTemp += control.at(i).get('value').value;

        queryArray.push(queryTemp);
      }
    }

    dot.object(tgt);

    var prettyObj = JSON.stringify(tgt, null, 4);
    selectedEditor.codeEditor.getSession().setValue(prettyObj);
    selectedQuery.nativeElement.value = queryArray.join('&');
  }

  editorUndo(index: number) {
    var selectedEditor = this.requestEditors.find(editor => editor.id == index);
    selectedEditor.codeEditor.undo();
  }

  editorRedo(index: number) {
    var selectedEditor = this.requestEditors.find(editor => editor.id == index);
    selectedEditor.codeEditor.redo();
  }

  editorErrors(index: number) {
    if(this.requestEditors) {
      var selectedEditor = this.requestEditors.find(editor => editor.id == index);

      if(selectedEditor) {
        var errors = selectedEditor.codeEditor.getSession().getAnnotations();

        return errors.length;
      }
    }
  }

  queryErrors(index: number) {
    var regex = new RegExp(VALID_QUERY);
    
    if(this.queryEditors) {
      var selectedEditor = this.queryEditors.find(query => query.nativeElement.id == index.toString());

      if(selectedEditor) {
        var queryValue = selectedEditor.nativeElement.value;

        return regex.test(queryValue);
      }
    }
  }

  openModal(target: string) {
    if(target == 'add') {
      this.newEditor = true;
    } else if(target == 'edit') {
      this.editWorkflowDetails.patchValue({ workflowName: this.workflowEditor.value.workflowName });
      this.editWorkflowDetails.patchValue({ workflowDescription: this.workflowEditor.value.workflowDescription });

      this.editDetails = true;
    }
  }

  closeModal(target: string) {
    if(target == 'add') {
      this.newEditor = false;
    } else if(target == 'edit') {
      this.editDetails = false;
    }
  }

  refreshDevices() {
    this.caneService.getAccount().toPromise()
    .then(
      res => {
        this.accountList = res['devices'];
      }
    )
  }

  refreshApis(account: string) {
    this.caneService.getApi(account).toPromise()
    .then(
      res => {
        this.apiList = res['apis'];
      }
    )
  }

  getAccounts() {
    // return Object.keys(this.fakeApis);
    // console.log(this.caneService.getAccount());
    return this.accountList;
  }

  getApis(account: string) {
    if(account) {
      return Object.keys(this.fakeApis[account]);
    }
  }

  getVerb(account: string, api: string) {

  }

  moveStep(direction: string) {
    var control = <FormArray>this.workflowEditor.controls['steps'];
    var tempControl: AbstractControl;
    var tempState;

    this.stateTracker.activeFieldDrop = null;
    this.stateTracker.activeParamDrop = null;

    if(direction == 'up') {
      for(var i = 0; i <= (control.controls.length - 1); i++) {
        if(i > 0) {
          if(control.at(i).get('selected').value == true) {
            tempControl = control.at(i);
            control.removeAt(i);
            control.insert((i-1), tempControl);
            tempState = this.stateTracker.steps[i];
            this.stateTracker.steps.splice(i, 1);
            this.stateTracker.steps.splice((i-1), 0, tempState);

            if(this.stateTracker.openEditor == i) {
              this.stateTracker.openEditor = (i-1);
            } else if(this.stateTracker.openEditor == (i-1)) {
              this.stateTracker.openEditor = i;
            }
          }
        }
      }
    }

    if (direction == 'down') {
      for(var i = (control.controls.length - 1); i >= 0; i--) {
        if( i < (control.controls.length - 1)) {
          if(control.at(i).get('selected').value == true) {
            tempControl = control.at(i);
            control.removeAt(i);
            control.insert((i+1), tempControl);
            tempState = this.stateTracker.steps[i];
            this.stateTracker.steps.splice(i, 1);
            this.stateTracker.steps.splice((i+1), 0, tempState);

            if(this.stateTracker.openEditor == i) {
              this.stateTracker.openEditor = (i+1);
            } else if (this.stateTracker.openEditor == (i+1)) {
              this.stateTracker.openEditor = i;
            }
          }
        }
      }
    }

    this.changeDetector.detectChanges();
  }

  checkUncheck(target: HTMLInputElement, step: number, type: string) {
    var control = (<FormArray>this.workflowEditor.controls['steps']).at(step).get(type) as FormArray;

    for(var i = 0; i <= (control.controls.length - 1); i++) {
      if(target.checked) {
        control.at(i).get('selected').setValue(true);
      } else {
        control.at(i).get('selected').setValue(false);
      }
    }

    this.changeDetector.detectChanges();
  }

/*
// Workflow Struct
type Workflow struct {
	Name        string
	Description string
	Type        string
	Steps       []Step
	// Note, add OutputMap []map[string]string
}

// Step Struct
type Step struct {
	title         string
	description   string
	apiCall       string
	deviceAccount string
	varMap        []map[string]string
}

// New Step Struct
type Step struct {
	title         string
	description   string
	apiCall       string
	deviceAccount string
  headers       []map[string]string
  variables     []map[string]string
  body          []map[string]string
  query         []map[string]string
}
*/

  saveWorkflow(data: object) {
    var newWorkflow = {
      name: '',
      description: '',
      type: '',
      steps: []
    };

    newWorkflow.name = data['workflowName'];
    newWorkflow.description = data['workflowDescription'];
    // newWorkflow.type = data['workflowType'];

    data['steps'].forEach(
      step => {
        var newStep = {
          title: '',
          description: '',
          apiCall: '',
          deviceAccount: '',
          headers: [],
          variables: [],
          body: [],
          query: []
        };

        newStep.title = step['stepTitle'];
        // newStep.description = step['stepDescription'];
        newStep.deviceAccount = step['stepAccount'];
        newStep.apiCall = step['stepAPI'];

        step['headers'].forEach(
          header => {
            var newHeader = {};
            newHeader[header['name']] = header['value'];
            newStep.headers.push(newHeader);
          });
        step['params'].forEach(
          param => {
            if(param['paramType'] == 'body') {
              var newBody = {};
              newBody[param['name']] = param['value'];
              newStep.body.push(newBody);
            }

            if(param['paramType'] == 'query') {
              var newQuery = {};
              newQuery[param['name']] = param['value'];
              newStep.query.push(newQuery);
            }
          });
        step['variables'].forEach(
          variable => {
            var newVariable = {};
            newVariable[variable['name']] = variable['value'];
            newStep.variables.push(newVariable);
          });

        newWorkflow.steps.push(newStep);
      });

      console.log(newWorkflow);
      this.caneService.createWorkflow(newWorkflow).subscribe(
        res => {
          console.log(res);
        },
        error => {
          console.log(error);
          this.messageService.newMessage('error', error['statusText'], error['error']['message']);
        });
  }

  executeRequest() {
    console.log("Executing Request!");
  }

  detectChanges() {
    this.changeDetector.detectChanges();
  }
}
