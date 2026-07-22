import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateLgpdRequestDto, DenyLgpdRequestDto, ReviewLgpdRequestDto } from './dto/create-lgpd-request.dto';
import { PrivacyService } from './privacy.service';

@Controller('admin/privacy/requests')
@RequirePermission('privacidade.gerenciar')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}
  @Get() list(@CurrentUser() user: RequestUser) { return this.privacy.list(user.tenantId); }
  @Post() create(@Body() dto: CreateLgpdRequestDto, @CurrentUser() user: RequestUser) { return this.privacy.create(dto, user); }
  @Patch(':uuid/verify') verify(@Param('uuid', ParseUUIDPipe) uuid: string, @CurrentUser() user: RequestUser) { return this.privacy.verify(uuid, user); }
  @Patch(':uuid/approve') approve(@Param('uuid', ParseUUIDPipe) uuid: string, @Body() dto: ReviewLgpdRequestDto, @CurrentUser() user: RequestUser) { return this.privacy.approve(uuid, dto, user); }
  @Patch(':uuid/deny') deny(@Param('uuid', ParseUUIDPipe) uuid: string, @Body() dto: DenyLgpdRequestDto, @CurrentUser() user: RequestUser) { return this.privacy.deny(uuid, dto, user); }
  @Post(':uuid/execute') execute(@Param('uuid', ParseUUIDPipe) uuid: string, @CurrentUser() user: RequestUser) { return this.privacy.execute(uuid, user); }
}
