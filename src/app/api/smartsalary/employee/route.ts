// src/app/api/smartsalary/employee/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SS_API = 'https://api.partena-professional.be/salary-api/api/v1/Employee';

export async function POST(req: NextRequest) {
  // Vérifier auth manager
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { token, worker } = await req.json();
  if (!token || !worker) {
    return NextResponse.json({ error: 'Token ou worker manquant' }, { status: 400 });
  }

  // Construire le payload SmartSalary
  const isStudent = worker.status === 'student';
  const payrollGroupId = isStudent ? '05' : '02';

  const niss = (worker.niss || '').replace(/[\.\-\s]/g, '');
  const dateIn = worker.dateInService; // format ISO
  const dateOut = worker.dateOutService;

  const payload = {
    personId: null,
    identity: {
      lastName: worker.last_name,
      firstName: worker.first_name,
      personId: null,
      inss: niss,
      nationalityId: '11', // Belge
      languageId: (worker.language || worker.langue) === 'NL' ? '2' : (worker.language || worker.langue) === 'DE' ? '3' : (worker.language || worker.langue) === 'EN' ? '4' : '1',
      genderId: (worker.gender || worker.sexe) === 'M' ? '1' : (worker.gender || worker.sexe) === 'F' ? '2' : '1',
      birthDate: worker.date_of_birth ? new Date(worker.date_of_birth).toISOString() : null,
      birthCountryId: '150', // Belgique
      birthPlace: worker.birth_place || worker.lieu_de_naissance || '',
      studyLevelId: mapStudyLevel(worker.education_level || worker['niveau_d\'études']),
      isDimonaWorker: false,
    },
    contact: {
      homeAddress: {
        street: worker.address_street || '',
        number: '',
        city: worker.address_city || '',
        cityId: null,
        zipCode: worker.address_zip || '',
        countryId: '150',
        box: '',
        region: '',
      },
      personId: null,
      workPhone: worker.phone || '',
      workEmail: worker.email || '',
      privatePhone: '',
      privateEmail: '',
    },
    fiscalSituation: {
      partnerLastName: '',
      partnerFirstName: '',
      numberOfChildrenAtCharge: 0,
      numberOfChildrenDisabled: 0,
      workerDisabled: false,
      personsAtCharge: [],
      civilStatusId: '1', // Célibataire
      partnerDisabled: false,
      civilStatusEntryYear: null,
    },
    bankAccount: {
      paymentChoice: '4',
      iban: (worker.iban || '').replace(/\s/g, ''),
      bic: '',
      agency: '',
    },
    messagePRC: '',
    contract: {
      payrollUnitId: '308091',
      payrollGroupId,
      dateInService: dateIn,
      categoryId: '03',
      subCategoryId: 'O',
      regionId: null,
      activityId: '2',
      isActivePensioner: worker.status === 'pensioner',
      activityOfficialJointCommittee: '302.00',
      activityTechnicalJointCommittee: '302.00.00',
      activityWorkerClassification: 'Y',
      isDimonaRelevant: true,
      governanceLevel: null,
      contractPeriods: [{
        dateInService: dateIn,
        dateOutService: dateOut,
        hoursWorked: null,
        c32CurrentMonth: '',
        c32NextMonth: '',
        dimonaRequested: false,
        dimonaInvoiceRequested: null,
        reasonOutServiceId: '04',
        noticeStartingDate: null,
        noticeNotificationDate: null,
      }],
      department: { departmentCode: '0000000' },
      imposedStartDate: null,
      endTrialDate: null,
      establishmentUnit: { validityDate: null, validityEndDate: null, address: null },
      establishmentUnitId: '1',
      officialJointCommittee: {},
      chosenJointCommittee: {},
      wagePackage: {
        salaryInformation: {
          salaryTypeId: '1',
          amount: parseFloat(worker.hourly_rate) || 12.78,
          cafeteriaPlanAmount: 0,
          professionalCategory: '2',
          effectiveDate: dateIn,
          officialJointCommittee: '',
          baremaAutomatic: '',
          seniorityEntryDate: dateIn,
          additionalSeniorityMonths: 0,
          additionalSeniorityYears: 0,
          governanceLevel: null,
          flexiJobAmount: 0,
          baremicSeniorityMonths: 0,
          baremicSeniorityYears: 0,
        },
        contractWageComponents: [],
        payWageComponents: [],
        companyVehicles: [],
        transportCosts: [],
        transportCostIsAutomaticCalculation: 'NoAutomaticCalculation',
      },
      dateOutService: dateOut,
      contractualSeniorityStartDate: null,
      classRiskId: '001',
      noticeNotificationDate: null,
      noticeStartingDate: null,
      scheduleStartDate: null,
      effectiveDate: null,
      jobTitleHorecaId: null,
      apprenticeContractNumber: null,
      contractTypeId: 'B',
      scientificResearcherType: null,
      journalistNumber: null,
      journalistStartDate: null,
      journalistEndDate: null,
      jobTitle: 'Polyvalent',
      scheduleId: '0000003',
      fullTime: false,
      isOccasional: false,
      workerType: 'OU',
      requestGuaranteeIncome: null,
      requestMaintenanceOfRights: null,
      subsidizedMaribel: null,
      subsidizedMaribelHours: null,
      subsidizedMaribelStart: null,
      contractNumber: '',
      isManagement: false,
    },
  };

  try {
    const res = await fetch(SS_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'fr',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!res.ok) {
      return NextResponse.json({ error: data, status: res.status, raw: text }, { status: res.status });
    }

    return NextResponse.json({ success: true, personId: data?.result?.personId, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function mapStudyLevel(level: string | null): string {
  const map: Record<string, string> = {
    'Enseignement primaire': '1',
    'Enseignement secondaire inférieur': '2',
    'Enseignement secondaire supérieur': '3',
    'Enseignement supérieur non universitaire': '4',
    'Enseignement universitaire': '5',
  };
  return level ? (map[level] || '3') : '3';
}
